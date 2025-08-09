import {computed, watchEffect} from 'vue';
import {useStorage} from '@vueuse/core';
import {
  Mat3,
  Rectangle,
  Vec2,
  apply,
  compose,
  eye,
  invert,
  scale,
  sub,
  translate,
} from '../common';

export type TaskID = number;

export type Task = Rectangle & {
  id: TaskID;
  title: string;
  description: string;
  dependencies: TaskID[];
  status: 'pending' | 'completed' | 'blocked';
};

function clipLineBetweenRectangles(
  rect1: Rectangle,
  rect2: Rectangle,
): {start: Vec2; end: Vec2} {
  const p0 = {
    x: rect1.at[0] + rect1.width / 2,
    y: rect1.at[1] + rect1.height / 2,
  };
  const p1 = {
    x: rect2.at[0] + rect2.width / 2,
    y: rect2.at[1] + rect2.height / 2,
  };

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  // Function to find the first intersection of the segment (p0, p1) with the rect
  function intersectRect(rect: Rectangle): Vec2 {
    const minX = rect.at[0];
    const maxX = rect.at[0] + rect.width;
    const minY = rect.at[1];
    const maxY = rect.at[1] + rect.height;

    const tValues: number[] = [];
    if (dx !== 0) {
      // Check left edge
      const t = (minX - p0.x) / dx;
      const y = p0.y + t * dy;
      if (t >= 0 && t <= 1 && y >= minY && y <= maxY) {
        tValues.push(t);
      }
    }
    if (dx !== 0) {
      // Check right edge
      const t = (maxX - p0.x) / dx;
      const y = p0.y + t * dy;
      if (t >= 0 && t <= 1 && y >= minY && y <= maxY) {
        tValues.push(t);
      }
    }
    if (dy !== 0) {
      // Check top edge
      const t = (minY - p0.y) / dy;
      const x = p0.x + t * dx;
      if (t >= 0 && t <= 1 && x >= minX && x <= maxX) {
        tValues.push(t);
      }
    }
    if (dy !== 0) {
      // Check bottom edge
      const t = (maxY - p0.y) / dy;
      const x = p0.x + t * dx;
      if (t >= 0 && t <= 1 && x >= minX && x <= maxX) {
        tValues.push(t);
      }
    }
    if (tValues.length === 0) {
      return [(minX + maxX) / 2, (minY + maxY) / 2];
    }

    const t = Math.min(...tValues);
    return [p0.x + t * dx, p0.y + t * dy];
  }

  return {
    start: intersectRect(rect1),
    end: intersectRect(rect2),
  };
}

export function useDB() {
  type DB = {
    tasks: Map<TaskID, Task>;
    nextTaskId: 1;
    view: Mat3;
  };
  const serializer = {
    read: (s: string): DB => {
      const raw = JSON.parse(s);
      raw.tasks = new Map(raw.tasks.map((v: Task) => [Number(v.id), v]));
      return raw;
    },
    write: (db: DB): string =>
      JSON.stringify({
        tasks: [...db.tasks.values()],
        nextTaskId: db.nextTaskId,
        view: db.view,
      }),
  };
  const db = useStorage<DB>(
    'dag-db',
    {
      tasks: new Map(),
      nextTaskId: 1,
      view: eye,
    },
    localStorage,
    {
      serializer: serializer,
    },
  );

  const isDAG = computed((): boolean => {
    enum State {
      Unvisited = 0,
      Visiting = 1,
      Visited = 2,
    }
    const state = new Map<TaskID, State>();
    for (const id of db.value.tasks.keys()) {
      state.set(id, 0);
    }

    const visit = (startID: TaskID): boolean => {
      // [currentId, nextDependencyIndex]
      const stack: [TaskID, number][] = [[startID, 0]];

      while (stack.length > 0) {
        const [id, idx] = stack[stack.length - 1];
        state.set(id, State.Visiting);
        const node = db.value.tasks.get(id)!;

        if (idx === node.dependencies.length) {
          stack.pop();
          state.set(id, State.Visited);
          continue;
        }

        stack[stack.length - 1][1]++;

        const depID = node.dependencies[idx];
        switch (state.get(depID)) {
          case State.Unvisited:
            stack.push([depID, 0]);
            break;
          case State.Visiting:
            return false;
        }
      }
      return true;
    };

    for (const id of db.value.tasks.keys()) {
      if (state.get(id) === State.Unvisited && !visit(id)) {
        return false;
      }
    }
    return true;
  });

  // update task statuses
  watchEffect(() => {
    for (const task of db.value.tasks.values()) {
      if (task.status === 'completed') {
        continue;
      }

      const allDependenciesCompleted = task.dependencies.every(
        (depId) => db.value.tasks.get(depId)?.status === 'completed',
      );
      task.status = allDependenciesCompleted ? 'pending' : 'blocked';
    }
  });

  const createTask = (pt: Vec2): TaskID => {
    const id = db.value.nextTaskId++;
    const width = 220;
    const height = 160;
    const v: Vec2 = apply(db.value.view, pt);
    db.value.tasks.set(id, {
      id,
      at: [v[0] - width / 2, v[1] - height / 2],
      width,
      height,
      title: `Task ${id}`,
      description: '',
      dependencies: [],
      status: 'pending',
    });
    return id;
  };

  const deleteTask = (id: TaskID): void => {
    if (!db.value.tasks.delete(id)) return;

    // Remove all edges connected to this task
    for (const task of db.value.tasks.values()) {
      task.dependencies = task.dependencies.filter((dep) => dep !== id);
    }

    // Remove dependencies
    for (const taskId of db.value.tasks.keys()) {
      const dependencies = db.value.tasks.get(taskId)!.dependencies;
      const index = dependencies.indexOf(id);
      if (index !== -1) {
        dependencies.splice(index, 1);
      }
    }
  };

  const toggleTaskCompletion = (id: TaskID): void => {
    const task = db.value.tasks.get(id)!;
    switch (task.status) {
      case 'completed':
        task.status = 'pending';
        break;
      case 'pending':
        task.status = 'completed';
        break;
      case 'blocked':
        alert('Task is blocked');
        break;
    }
  };

  function connectTasks(fromId: TaskID, toId: TaskID): void {
    if (fromId === toId) {
      return;
    }

    const deps = db.value.tasks.get(toId)!.dependencies;
    if (!deps.includes(fromId)) {
      deps.push(fromId);
      if (!isDAG.value) {
        alert('LOOP FOUND');
        deps.pop();
      }
    } else {
      db.value.tasks.get(toId)!.dependencies = deps.filter(
        (dep) => dep !== fromId,
      );
    }
  }

  const edgesCoords = computed(() => {
    return [...db.value.tasks.values()]
      .flatMap((task) =>
        task.dependencies.map((dep) => ({from: dep, to: task.id})),
      )
      .map(({from, to}) => {
        const fromTask = db.value.tasks.get(from)!;
        const toTask = db.value.tasks.get(to)!;

        // "grow" boxes a bit before finding connection line coords
        const grow = 7;
        const from2: Rectangle = {
          at: sub(fromTask.at, [grow, grow]),
          width: fromTask.width + grow * 2,
          height: fromTask.height + grow * 2,
        };
        const to2: Rectangle = {
          at: sub(toTask.at, [grow, grow]),
          width: toTask.width + grow * 2,
          height: toTask.height + grow * 2,
        };

        // Calculate closest points on task borders
        return clipLineBetweenRectangles(from2, to2);
      });
  });

  const viewReset = () => {
    db.value.view = eye;
  };

  function zoom(at: Vec2, d: number) {
    const zoomFactor = 0.1;
    const coeff = 1 - Math.sign(d) * zoomFactor;
    const tr = translate(apply(db.value.view, at));
    db.value.view = compose(db.value.view, invert(tr), scale(coeff), tr);
  }

  const level = computed(() => {
    if (!isDAG.value) return new Map();

    const allIDs = new Set<TaskID>([...db.value.tasks.keys()]);
    const depIDs = new Set<TaskID>(
      [...db.value.tasks.values()].flatMap((t) => t.dependencies),
    );
    const roots = allIDs.difference(depIDs);
    let frontier = [...roots];
    const levels = new Map<TaskID, number>();
    for (const id of roots) {
      levels.set(id, 0);
    }
    while (frontier.length > 0) {
      const newFrontier = new Set<TaskID>();
      for (const id of frontier) {
        const level = levels.get(id)!;
        const task = db.value.tasks.get(id)!;
        for (const dep of task.dependencies) {
          if (levels.has(dep) && levels.get(dep)! >= level + 1) {
            continue;
          }
          newFrontier.add(dep);
          levels.set(dep, level + 1);
        }
      }
      frontier = [...newFrontier];
    }
    return levels;
  });

  return {
    db,
    edgesCoords,
    createTask,
    deleteTask,
    toggleTaskCompletion,
    connectTasks,
    viewReset,
    zoom,
    serializer,
    level,
  };
}
