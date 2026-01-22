import { computed, watchEffect } from "vue";
import { useStorage } from "@vueuse/core";
import { getBoxToBoxArrow } from "curved-arrows";
import {
  Mat3,
  Rectangle,
  Size,
  Vec2,
  apply,
  compose,
  eye,
  invert,
  scale,
  translate,
} from "../common";

export type TaskID = number;

export type Task = {
  id: TaskID;
  title: string;
  description: string;
  dependencies: TaskID[];
  status: "pending" | "completed" | "blocked";
  at: Vec2;
};

function calculateTaskDimensions(title: string): Size {
  const ratio = 6 / 2;
  const charWidth = 10; // Approximate width per character (increased for better visibility)
  const lineHeight = 24; // Line height for text
  const padding = 16; // Padding around text

  const N = title.length + 4;
  const cols = Math.floor(Math.sqrt(ratio * lineHeight / charWidth * N));
  const width = charWidth * (cols + 1) + 2 * padding;
  const height = lineHeight * Math.floor(N / cols) + 2 * padding;
  return {width, height};
}

export function useDB() {
  type DB = {
    tasks: Map<TaskID, Task>;
    nextTaskId: 1;
    view: Mat3;
    hideDone?: boolean;
  };
  const serializer = {
    read: (s: string): DB => {
      const raw = JSON.parse(s);
      // Convert array to Map and recalculate dimensions for all tasks
      raw.tasks = new Map(
        raw.tasks.map((v: Task) => {
          const task = { ...v };
          return [Number(task.id), task];
        }),
      );
      return raw;
    },
    write: (db: DB): string =>
      JSON.stringify({
        tasks: [...db.tasks.values()],
        nextTaskId: db.nextTaskId,
        view: db.view,
        hideDone: db.hideDone || false,
      }),
  };
  const db = useStorage<DB>(
    "dag-db",
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

  const rects = computed(() => {
    const entries: Iterable<[TaskID, Size]> = [...db
      .value
      .tasks
      .values()]
      .map(task => [
        task.id,
        calculateTaskDimensions(task.title),
      ]);
    return new Map<TaskID, Size>(entries);
  });
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
      if (task.status === "completed") {
        continue;
      }

      const allDependenciesCompleted = task.dependencies.every(
        (depId) => db.value.tasks.get(depId)?.status === "completed",
      );
      task.status = allDependenciesCompleted ? "pending" : "blocked";
    }
  });

  const createTask = (pt: Vec2): TaskID => {
    const id = db.value.nextTaskId++;
    const title = `Task ${id}`;

    const v: Vec2 = apply(db.value.view, pt);
    db.value.tasks.set(id, {
      id,
      at: v,
      title,
      description: "",
      dependencies: [],
      status: "pending",
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
      case "completed":
        task.status = "pending";
        break;
      case "pending":
        task.status = "completed";
        break;
      case "blocked":
        alert("Task is blocked");
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
        alert("LOOP FOUND");
        deps.pop();
      }
    } else {
      db.value.tasks.get(toId)!.dependencies = deps.filter(
        (dep) => dep !== fromId,
      );
    }
  }

  const shownTasks = computed(() => {
    const tasks = [...db.value.tasks.values()];
    if (db.value.hideDone) {
      return tasks.filter((t) => t.status !== "completed");
    }
    return tasks;
  });

  const edgesCoords = computed(() => {
    return shownTasks.value
      .flatMap((task) =>
        task.dependencies
          .map(dep => ({ from: dep, to: task.id }))
          .filter(({from}) =>
            !db.value.hideDone ||
            db.value.tasks.get(from)!.status !== "completed"),
      )
      .map(({from, to}) => {
        const fromTask = db.value.tasks.get(from)!;
        const toTask = db.value.tasks.get(to)!;

        const {width: fromWidth, height: fromHeight} = calculateTaskDimensions(fromTask.title);
        const {width: toWidth, height: toHeight} = calculateTaskDimensions(toTask.title);

        return getBoxToBoxArrow(
          fromTask.at[0], fromTask.at[1], fromWidth, fromHeight,
          toTask.at[0], toTask.at[1], toWidth, toHeight);
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

    const allIDs = new Set<TaskID>(db.value.tasks.keys());
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

  const toggleHideDone = () => {
    db.value.hideDone = !(db.value.hideDone ?? false);
  };

  return {
    db,
    edgesCoords,
    rects,
    createTask,
    deleteTask,
    toggleTaskCompletion,
    connectTasks,
    viewReset,
    zoom,
    serializer,
    level,
    toggleHideDone,
    shownTasks,
  };
}
