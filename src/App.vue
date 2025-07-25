<script setup lang="ts">
// 3rd party libs
import {computed, reactive, useTemplateRef} from 'vue';
import {useMouse} from '@vueuse/core';
// local
// icons
import IconLink from './components/icons/IconLink.vue';
import IconTrash from './components/icons/IconTrash.vue';
import IconPlus from './components/icons/IconPlus.vue';
import IconHelp from './components/icons/IconHelp.vue';
import IconZoomReset from './components/icons/IconZoomReset.vue';
import IconZoomOut from './components/icons/IconZoomOut.vue';
import IconZoomIn from './components/icons/IconZoomIn.vue';
import IconSave from './components/icons/IconSave.vue';
import IconLoad from './components/icons/IconLoad.vue';
// components
import TaskModal from './components/TaskModal.vue';
import HelperModal from './components/HelperModal.vue';
// composables
import {useBool} from './composables/bool';
import {useDB, TaskID} from './composables/db';
import {
  apply,
  compose,
  download,
  invert,
  load,
  translate,
  Vec2,
} from './common';

const {x: mousex, y: mousey} = useMouse();
const {
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
} = useDB();

const svg = useTemplateRef('dag-svg');

function zoomUpdate(coeff: number): void {
  zoom([w.innerWidth / 2, w.innerHeight / 2], coeff);
}

const showHelperModal = useBool();
const showTodos = useBool();

const state = reactive<{
  state:
    | {
        kind: 'moving';
      }
    | {
        kind: 'dragging';
        selectedTask: TaskID;
        original: Vec2;
        start: Vec2;
      }
    | {
        kind: 'resizing';
        selectedTask: TaskID;
        start: Vec2;
      }
    | {
        kind: 'connecting';
        fromId: TaskID;
        connecting: Vec2;
      }
    | null;
  editTaskID?: TaskID;
}>({
  state: null,
});

function handleTaskMouseDownDrag(e: MouseEvent, taskId: TaskID) {
  if (state.state !== null) {
    return;
  }
  state.state = {
    kind: 'dragging',
    selectedTask: taskId,
    original: db.value.tasks.get(taskId)!.at,
    start: [e.clientX, e.clientY],
  };
}

function handleResizeMouseDown(e: MouseEvent, taskId: TaskID): void {
  state.state = {
    kind: 'resizing',
    selectedTask: taskId,
    start: db.value.tasks.get(taskId)!.at,
  };
}

const fromTask = computed(
  () =>
    (state.state?.kind === 'connecting' &&
      db.value.tasks.get(state.state.fromId)) ||
    null,
);

function setConnecting(x: number, y: number): Vec2 {
  return apply(db.value.view, [x, y]);
}

function handleMouseMove(e: MouseEvent) {
  if (!state.state) {
    return;
  }

  const m = db.value.view;
  if (state.state.kind === 'moving') {
    const move: Vec2 = [e.movementX, e.movementY];
    db.value.view = compose(
      m,
      translate(apply(m, [0, 0])),
      invert(translate(apply(m, move))),
    );
  } else if (state.state.kind === 'dragging') {
    const mouse = apply(m, [e.clientX, e.clientY]);
    const move = apply(m, state.state.start!);
    db.value.tasks.get(state.state.selectedTask)!.at = [
      mouse[0] + state.state.original![0] - move[0],
      mouse[1] + state.state.original![1] - move[1],
    ];
  } else if (state.state.kind === 'resizing') {
    const move = apply(m, [e.clientX, e.clientY]);
    const selTask = db.value.tasks.get(state.state.selectedTask)!;
    selTask.width = Math.max(100, move[0] - state.state.start![0]);
    selTask.height = Math.max(80, move[1] - state.state.start![1]);
  } else if (state.state.kind === 'connecting') {
    state.state.connecting = setConnecting(e.clientX, e.clientY);
  }
}

function handleMouseUp(e: MouseEvent) {
  if (!state.state) {
    return;
  }

  if (state.state.kind !== 'connecting') {
    state.state = null;
    return;
  }

  // Handle task connection
  // Find task at mouse position
  const [mouseX, mouseY] = apply(db.value.view, [e.clientX, e.clientY]);

  for (const [id, task] of db.value.tasks.entries()) {
    if (
      mouseX >= task.at[0] &&
      mouseX <= task.at[0] + task.width &&
      mouseY >= task.at[1] &&
      mouseY <= task.at[1] + task.height
    ) {
      connectTasks(state.state.fromId, id);
      break;
    }
  }
  state.state = null;
}

function onSVGMouseDown(e: MouseEvent) {
  if (state.state && state.state.kind !== 'moving') {
    return;
  }
  state.state = {
    kind: 'moving',
  };
  svg.value!.style.cursor = 'grabbing';
}
function onSVGClick(e: MouseEvent) {
  if (e.target !== svg.value!) {
    return;
  }

  if (e.detail === 2) {
    // Double-click on background to add task
    const rect = svg.value!.getBoundingClientRect();
    createTask([e.clientX - rect.left, e.clientY - rect.top]);
  } else if (state.state?.kind === 'connecting') {
    // Click on background to cancel connection
    state.state = null;
  }
}

function handleWheelZoom(e: WheelEvent) {
  zoom([e.clientX, e.clientY], -e.deltaY);
}

const readyTasks = computed(() => {
  return [...db.value.tasks.values()]
    .filter((task) => task.status === 'pending')
    .map((task) => task.id)
    .sort((a, b) => a - b);
});

function exportTasks() {
  download('tasks.json', serializer.write(db.value));
}

async function importTasks() {
  load().then((data) => (db.value = serializer.read(data)));
}
const w = window;
const viewbox = computed(() => {
  const origin = apply(db.value.view, [0, 0]);
  const dr = apply(db.value.view, [w.innerWidth, w.innerHeight]);
  return {
    origin,
    dr: [dr[0] - origin[0], dr[1] - origin[1]],
  };
});
function promptInput(value: string): string {
  const result = prompt('Task title', value);
  return result ?? value;
}
</script>

<template>
  <div
    id="app-container"
    v-on:mousemove="handleMouseMove"
    v-on:mouseup="handleMouseUp"
  >
    <div class="btn-group">
      <div class="btn-group-2">
        <button id="help-btn" title="Help" v-on:click="showHelperModal.toggle">
          <IconHelp />
        </button>
        <button
          title="Add task"
          v-on:click="() => createTask([w.innerWidth / 2, w.innerHeight / 2])"
          style="flex-grow: 1; justify-content: center"
        >
          <IconPlus />
        </button>
      </div>
      <div class="zoom-controls">
        <button class="zoom-btn" title="Zoom in" v-on:click="zoomUpdate(1)">
          <IconZoomIn />
        </button>
        <button class="zoom-btn" title="Zoom out" v-on:click="zoomUpdate(-1)">
          <IconZoomOut />
        </button>
        <button class="zoom-btn" title="Reset zoom" v-on:click="viewReset">
          <IconZoomReset />
        </button>
      </div>
      <div class="btn-group-2">
        <button class="zoom-btn" title="Export tasks" v-on:click="exportTasks">
          <IconSave />
        </button>
        <button class="zoom-btn" title="Import tasks" v-on:click="importTasks">
          <IconLoad />
        </button>
      </div>
      <div style="max-width: 40em">
        <div v-on:click="() => showTodos.toggle()" style="cursor: pointer">
          TODO {{ showTodos.value.value ? 'v' : '>' }}
        </div>
        <div
          v-if="showTodos.value.value"
          style="
            height: calc(100vh - 20em);
            overflow-y: scroll;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          "
        >
          <div
            v-for="id in readyTasks"
            :key="id"
            v-on:click="() => (state.editTaskID = id)"
            style="background: rgb(0, 0, 0, 0.3); padding: 5px; cursor: pointer"
          >
            <a> {{ db.tasks.get(id)!.title }} (#{{ id }}) </a>
          </div>
        </div>
      </div>
    </div>

    <svg
      ref="dag-svg"
      id="dag-svg"
      v-on:mousedown="onSVGMouseDown"
      v-on:click="onSVGClick"
      v-on:wheel.stop="handleWheelZoom"
      :viewBox="`${viewbox.origin[0]} ${viewbox.origin[1]} ${viewbox.dr[0]} ${viewbox.dr[1]}`"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#7e57c2" />
        </marker>
      </defs>
      <line
        v-for="edge in edgesCoords"
        :x1="edge.start[0]"
        :y1="edge.start[1]"
        :x2="edge.end[0]"
        :y2="edge.end[1]"
        class="edge"
      />
      <line
        v-if="state.state?.kind === 'connecting'"
        :x1="fromTask!.at[0] + fromTask!.width / 2"
        :y1="fromTask!.at[1] + fromTask!.height / 2"
        :x2="state.state.connecting[0]"
        :y2="state.state.connecting[1]"
        class="connecting-line"
      />
      <g
        v-for="[id, task] of db.tasks.entries()"
        :key="id"
        :transform="`translate(${task.at[0]}, ${task.at[1]})`"
        class="task-group"
        v-on:mousedown.stop="
          (e: MouseEvent) => handleTaskMouseDownDrag(e, task.id)
        "
      >
        <rect
          :width="task.width"
          :height="task.height"
          :class="`task-rect task-${task.status}`"
        />
        <circle
          :cx="task.width"
          :cy="task.height"
          :r="8"
          fill="rgba(100, 100, 255, 0.5)"
          class="resize-handle"
          v-on:mousedown.stop="(e) => handleResizeMouseDown(e, task.id)"
        />
        <foreignObject
          :width="task.width.toString()"
          :height="task.height.toString()"
          class="task-content"
        >
          <div class="task" v-on:dblclick="() => (state.editTaskID = task.id)">
            <div style="width: 100%; height: 100%">
              <div
                class="task-header"
                v-on:dblclick.stop="
                  () => {
                    task.title = promptInput(task.title);
                  }
                "
              >
                ({{ level.get(task.id) }})
                {{ task.title }}
              </div>
            </div>
            <div class="task-actions">
              <button
                class="task-checkbox delete-btn"
                v-on:click.stop="(e: MouseEvent) => deleteTask(task.id)"
              >
                <IconTrash />
              </button>
              <button
                class="task-checkbox connect-btn"
                v-on:click.stop="
                  (e: MouseEvent) =>
                    (state.state = {
                      kind: 'connecting',
                      fromId: task.id,
                      connecting: setConnecting(mousex, mousey),
                    })
                "
              >
                <IconLink />
              </button>
              <div style="flex-grow: 1"></div>
              <button
                v-if="task.status !== 'blocked'"
                class="task-checkbox"
                :checked="task.status === 'completed'"
                v-on:click="() => toggleTaskCompletion(task.id)"
              >
                {{ task.status === 'completed' ? 'Cancel' : 'Complete' }}
              </button>
              <div v-else></div>
            </div>
          </div>
        </foreignObject>
      </g>
    </svg>

    <div
      v-if="state.editTaskID || showHelperModal.value.value"
      class="backdrop"
      v-on:click="
        () => {
          state.editTaskID = undefined;
          showHelperModal.off();
        }
      "
    ></div>
    <TaskModal
      v-if="state.editTaskID"
      :taskID="state.editTaskID"
      v-on:close="() => (state.editTaskID = undefined)"
      v-on:reselect="(id) => (state.editTaskID = id)"
    />
    <div id="help-modal" v-if="showHelperModal.value.value">
      <HelperModal v-on:close="() => showHelperModal.off()" />
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  overflow: hidden;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #e6e6e6;
  height: 100vh;
  width: 100vw;
}
</style>

<style scoped>
#app-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  user-select: none;
}

.btn-group-2 {
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.btn-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 10;
  background: rgba(30, 30, 46, 0.8);
  border-radius: 10px;
  padding: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(5px);
  max-width: 300px;
}

button {
  background: #4a4a72;
  color: white;
  border: none;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

button:hover {
  background: #5a5a8a;
}

#help-btn {
  width: 44px;
  background: #00b4d8;
}

#help-btn:hover {
  background: #0096c7;
}

#dag-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: grab;
}

#dag-svg:active {
  cursor: grabbing;
}

.task {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.task-rect {
  stroke: #444;
  stroke-width: 2;
  rx: 8;
  ry: 8;
  cursor: move;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3));
}

.task-group {
  cursor: move;
}

.task-content {
  cursor: move;
}

.task-pending {
  fill: #ffd700;
}

.task-completed {
  fill: #4caf50;
}

.task-blocked {
  fill: #f44336;
}

.task-header {
  font-weight: 600;
  font-size: 16px;
  color: black;
  padding: 8px 12px 4px;
  flex-grow: 1;
}

.task-description {
  font-size: 14px;
  color: #444;
  padding: 8px 12px;
  flex-grow: 1;
}

.task-actions {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.1);
}

.task-checkbox,
.connect-btn,
.delete-btn {
  height: 1.8rem;
  background: rgb(0, 0, 0, 0.2);
  color: black;
  font-weight: bold;
  justify-content: center;
  cursor: pointer;
  padding: 3px;
}

.task-checkbox svg,
.connect-btn svg,
.delete-btn svg {
  width: 100%;
  height: 100%;
}

.task-checkbox:hover,
.connect-btn:hover,
.delete-btn:hover {
  background: rgb(0, 0, 0, 0.4);
}

.task-checkbox {
  width: 5.5em;
}

.connect-btn,
.delete-btn {
  width: 3em;
}

.edge {
  stroke: #7e57c2;
  stroke-width: 3;
  marker-end: url(#arrowhead);
}

.connecting-line {
  stroke: #64ffda;
  stroke-width: 2;
  stroke-dasharray: 5, 5;
}

#help-modal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(26, 26, 46, 0.95);
  border: 1px solid #4a4a72;
  border-radius: 12px;
  padding: 20px;
  width: 60%;
  z-index: 20;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}

#task-modal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(26, 26, 46, 0.95);
  border: 1px solid #4a4a72;
  border-radius: 12px;
  padding: 20px;
  width: 80%;
  z-index: 40;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}

.zoom-controls {
  background: rgba(30, 30, 46, 0.8);
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  gap: 8px;
  z-index: 10;
  backdrop-filter: blur(5px);
}

.zoom-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resize-handle:hover {
  cursor: nwse-resize;
}

.backdrop {
  background-color: rgb(0, 0, 0, 0.8);
  width: 100vw;
  height: 100vh;
  position: absolute;
  backdrop-filter: blur(9px);
  z-index: 11;
}
</style>
