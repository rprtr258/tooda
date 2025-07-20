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

  const edgesCoords = computed(() => {
    return [...db.value.tasks.values()]
      .flatMap((task) =>
        task.dependencies.map((dep) => ({from: dep, to: task.id})),
      )
      .map(({from, to}) => {
        const fromTask = db.value.tasks.get(from)!;
        const toTask = db.value.tasks.get(to)!;
        // Calculate closest points on task borders
        return clipLineBetweenRectangles(fromTask, toTask);
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

  return {
    db,
    edgesCoords,
    createTask,
    deleteTask,
    toggleTaskCompletion,
    viewReset,
    zoom,
    serializer,
  };
}
