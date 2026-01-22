<script setup lang="ts">
// 3rd party libs
import {computed, reactive, useTemplateRef, watch} from 'vue';
import {useMouse} from '@vueuse/core';
// local
// icons
import IconBoard from './components/icons/IconBoard.vue';
import IconEyeClose from './components/icons/IconEyeClose.vue';
import IconEyeOpen from './components/icons/IconEyeOpen.vue';
import IconHelp from './components/icons/IconHelp.vue';
import IconLink from './components/icons/IconLink.vue';
import IconLoad from './components/icons/IconLoad.vue';
import IconPlus from './components/icons/IconPlus.vue';
import IconSave from './components/icons/IconSave.vue';
import IconTrash from './components/icons/IconTrash.vue';
import IconZoomIn from './components/icons/IconZoomIn.vue';
import IconZoomOut from './components/icons/IconZoomOut.vue';
import IconZoomReset from './components/icons/IconZoomReset.vue';
// components
import TaskModal from './components/TaskModal.vue';
import HelperModal from './components/HelperModal.vue';
// composables
import {useBool} from './composables/bool';
import {useDB, TaskID, Task} from './composables/db';
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
  toggleHideDone,
  shownTasks,
} = useDB();

const svg = useTemplateRef('dag-svg');

function zoomUpdate(coeff: number): void {
  zoom([w.innerWidth / 2, w.innerHeight / 2], coeff);
}

const showKanban = useBool();
const showHelperModal = useBool();

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
  activeTaskId?: TaskID;
}>({
  state: null,
});

watch(
  () => showHelperModal.value.value,
  () => (state.activeTaskId = undefined),
);

function handleTaskClick(e: MouseEvent, taskId: TaskID) {
  // Don't activate toolbar on double-click (let it edit title)
  if (e.detail === 2) {
    state.activeTaskId = undefined;
    return;
  }

  // Don't activate toolbar if we're connecting
  if (state.state?.kind === 'connecting') {
    return;
  }

  // Toggle toolbar for this task
  if (state.activeTaskId === taskId) {
    state.activeTaskId = undefined;
  } else {
    state.activeTaskId = taskId;
  }
}

function handleTaskMouseDownDrag(e: MouseEvent, taskId: TaskID) {
  if (state.state !== null) {
    return;
  }

  // Don't hide toolbar immediately - wait to see if it's a drag or click
  // The click handler will show/hide toolbar

  state.state = {
    kind: 'dragging',
    selectedTask: taskId,
    original: db.value.tasks.get(taskId)!.at,
    start: [e.clientX, e.clientY],
  };
}

function handleResizeMouseDown(e: MouseEvent, taskId: TaskID): void {
  if (state.state !== null) {
    return;
  }

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
    // Hide toolbar when dragging actually starts
    state.activeTaskId = undefined;

    const mouse = apply(m, [e.clientX, e.clientY]);
    const move = apply(m, state.state.start!);
    db.value.tasks.get(state.state.selectedTask)!.at = [
      mouse[0] + state.state.original![0] - move[0],
      mouse[1] + state.state.original![1] - move[1],
    ];
  } else if (state.state.kind === 'resizing') {
    // Hide toolbar when resizing actually starts
    state.activeTaskId = undefined;

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
  } else {
    // Single click on background hides toolbar
    state.activeTaskId = undefined;
  }
}

function handleWheelZoom(e: WheelEvent) {
  zoom([e.clientX, e.clientY], -e.deltaY);
}

const tasksByStatus = computed(() => {
  const res: Record<Task['status'], TaskID[]> = {
    blocked: [],
    completed: [],
    pending: [],
  };
  for (const task of db.value.tasks.values()) {
    res[task.status].push(task.id);
  }
  for (const tasks of Object.values(res)) {
    tasks.sort((a, b) => a - b);
  }
  return res;
});

const activeTask = computed(() =>
  state.activeTaskId ? db.value.tasks.get(state.activeTaskId) : null,
);

const toolbarPosition = computed(() => {
  if (!activeTask.value || !svg.value) return null;

  const task = activeTask.value;
  const toolbarHeight = 60; // Toolbar height including padding
  const margin = 10;
  // Actual toolbar width: 3 buttons (40px each) + gaps (16px) + padding (16px)
  const toolbarWidth =
    40 +
    16 +
    40 +
    (state.activeTaskId &&
    db.value.tasks.get(state.activeTaskId)?.status !== 'blocked'
      ? 16 + 40
      : 0);

  // Convert task coordinates from SVG to screen
  // Need inverse transformation: SVG -> screen
  const invertedView = invert(db.value.view);
  const taskTopLeft = apply(invertedView, task.at);
  const taskBottomRight = apply(invertedView, [
    task.at[0] + task.width,
    task.at[1] + task.height,
  ]);

  const taskScreenWidth = taskBottomRight[0] - taskTopLeft[0];

  // Position above the task in screen coordinates
  let top = taskTopLeft[1] - toolbarHeight - margin;
  // If not enough space above, position below
  if (top < 0) {
    top = taskBottomRight[1] + margin;
  }

  const containerWidth = window.innerWidth;
  // Ensure toolbar doesn't go off screen horizontally
  let left = taskTopLeft[0] + (taskScreenWidth - toolbarWidth) / 2;
  if (left < 0) {
    left = 0;
  } else if (left + toolbarWidth > containerWidth) {
    left = containerWidth - toolbarWidth;
  }

  return {
    top: `${top}px`,
    left: `${left}px`,
  };
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
    v-if="!showKanban.value.value"
    v-on:mousemove="handleMouseMove"
    v-on:mouseup="handleMouseUp"
  >
    <div class="btn-group">
      <div class="btn-group-2">
        <button id="help-btn" title="Help" v-on:click="showHelperModal.toggle">
          <IconHelp />
        </button>
        <button
          id="help-btn"
          title="Add task"
          v-on:click="() => createTask([w.innerWidth / 2, w.innerHeight / 2])"
        >
          <IconPlus />
        </button>
        <button
          id="help-btn"
          :title="db.hideDone ? 'Show completed' : 'Hide completed'"
          v-on:click="() => toggleHideDone()"
        >
          <IconEyeClose v-if="db.hideDone" />
          <IconEyeOpen v-else />
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
        <button
          class="zoom-btn"
          title="Show board"
          v-on:click="() => showKanban.on()"
        >
          <IconBoard />
        </button>
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
          refX="8"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--task-edge)" />
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
        v-for="task of shownTasks"
        :key="task.id"
        :transform="`translate(${task.at[0]}, ${task.at[1]})`"
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
          v-on:click.stop="(e: MouseEvent) => handleTaskClick(e, task.id)"
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
          </div>
        </foreignObject>
      </g>
    </svg>

    <div
      v-if="state.activeTaskId && toolbarPosition"
      class="task-actions"
      :class="`task-actions-${activeTask?.status || 'pending'}`"
      :style="toolbarPosition"
      v-on:click.stop
    >
      <button
        class="toolbar-btn delete-btn"
        title="Delete task"
        v-on:click.stop="
          () => {
            deleteTask(state.activeTaskId!);
            state.activeTaskId = undefined;
          }
        "
      >
        <IconTrash />
      </button>
      <button
        class="toolbar-btn connect-btn"
        title="Connect task"
        v-on:click.stop="
          () => {
            state.state = {
              kind: 'connecting',
              fromId: state.activeTaskId!,
              connecting: setConnecting(mousex, mousey),
            };
            state.activeTaskId = undefined;
          }
        "
      >
        <IconLink />
      </button>
      <button
        v-if="activeTask && activeTask.status !== 'blocked'"
        class="toolbar-btn"
        :title="
          activeTask.status === 'completed'
            ? 'Cancel completion'
            : 'Complete task'
        "
        v-on:click.stop="
          () => {
            toggleTaskCompletion(state.activeTaskId!);
            state.activeTaskId = undefined;
          }
        "
      >
        {{ activeTask.status === 'completed' ? 'Cancel' : 'Complete' }}
      </button>
    </div>
  </div>
  <div
    id="app-container"
    v-else
    v-on:mousemove="handleMouseMove"
    v-on:mouseup="handleMouseUp"
  >
    <button
      title="Close"
      style="
        position: absolute;
        top: 0;
        right: 0;
        z-index: 1;
        padding: 8px;
        background-color: red;
        border: 5px solid brown;
      "
      v-on:click="() => showKanban.off()"
    >
      X
    </button>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr">
      <div class="board-pane" style="background-color: var(--task-blocked-bg)">
        <div class="board-pane-header">BLOCKED</div>
        <div class="board-pane-list">
          <div
            v-for="id in tasksByStatus.blocked"
            :key="id"
            v-on:click="() => (state.editTaskID = id)"
            class="board-item"
          >
            <a> {{ db.tasks.get(id)!.title }} (#{{ id }}) </a>
          </div>
          <div style="height: 3em"></div>
        </div>
      </div>
      <div class="board-pane" style="background-color: var(--task-pending-bg)">
        <div class="board-pane-header">TODO</div>
        <div class="board-pane-list">
          <div
            v-for="id in tasksByStatus.pending"
            :key="id"
            v-on:click="() => (state.editTaskID = id)"
            class="board-item"
          >
            <a> {{ db.tasks.get(id)!.title }} (#{{ id }}) </a>
          </div>
          <div style="height: 3em"></div>
        </div>
      </div>
      <div
        class="board-pane"
        style="background-color: var(--task-completed-bg)"
      >
        <div class="board-pane-header">DONE</div>
        <div class="board-pane-list">
          <div
            v-for="id in tasksByStatus.completed"
            :key="id"
            v-on:click="() => (state.editTaskID = id)"
            class="board-item"
          >
            <a> {{ db.tasks.get(id)!.title }} (#{{ id }}) </a>
          </div>
          <div style="height: 3em"></div>
        </div>
      </div>
    </div>
  </div>

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
    v-on:complete="() => toggleTaskCompletion(state.editTaskID!)"
    v-on:reselect="(id) => (state.editTaskID = id)"
  />
  <div id="help-modal" v-if="showHelperModal.value.value">
    <HelperModal v-on:close="() => showHelperModal.off()" />
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
  background: var(--background);
  color: var(--foreground);
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
}

.btn-group {
  display: flex;
  /* flex-direction: column; */
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 10;
  background: rgba(30, 30, 30, 0.8);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  max-width: 300px;
}

.btn-group button {
  border: 1px solid var(--menu-button-bg-hover);
  padding: 6px;
}

button {
  background: var(--menu-button-bg);
  color: var(--menu-button-fg);
  border: none;
  /* padding: 10px; */
  max-height: 30px;
  max-width: 30px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

button:hover {
  background: var(--menu-button-bg-hover);
}

#help-btn {
  width: 40px;
  height: 40px;
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
  stroke: var(--task-border);
  stroke-width: 2;
  rx: 8;
  ry: 8;
  cursor: move;
}

.task-content {
  cursor: move;
}

.task-pending {
  fill: var(--task-pending-bg);
}

.task-completed {
  fill: var(--task-completed-bg);
}

.task-blocked {
  fill: var(--task-blocked-bg);
}

.task-header {
  font-weight: 600;
  font-size: 16px;
  color: var(--task-fg);
  padding: 8px 12px 4px;
  flex-grow: 1;
}

.connect-btn,
.delete-btn {
  height: 1.8rem;
  background: rgb(0, 0, 0, 0.2);
  color: var(--task-fg);
  font-weight: bold;
  justify-content: center;
  cursor: pointer;
  padding: 3px;
}

.connect-btn svg,
.delete-btn svg {
  width: 100%;
  height: 100%;
}

.connect-btn:hover,
.delete-btn:hover {
  background: rgb(0, 0, 0, 0.4);
}

.connect-btn,
.delete-btn {
  width: 3em;
}

.task-actions {
  position: absolute;
  display: flex;
  flex-direction: row;
  gap: 6px;
  border-radius: 10px;
  padding: 6px 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(5px);
  z-index: 100;
}

.task-actions button {
  min-width: fit-content;
}

.task-actions-blocked {
  background: var(--task-toolbar-blocked-bg);
}

.task-actions-pending {
  background: var(--task-toolbar-pending-bg);
}

.task-actions-completed {
  background: var(--task-toolbar-completed-bg);
}

.toolbar-btn {
  color: var(--task-fg);
  border: none;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 40px;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.2);
}

.toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.4);
}

.task-actions-blocked .toolbar-btn {
  background: var(--task-toolbar-btn-blocked-bg);
}

.task-actions-blocked .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.3);
}

.task-actions-pending .toolbar-btn {
  background: var(--task-toolbar-btn-pending-bg);
}

.task-actions-pending .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.3);
}

.task-actions-completed .toolbar-btn {
  background: var(--task-toolbar-btn-completed-bg);
}

.task-actions-completed .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.3);
}

.toolbar-btn svg {
  width: 100%;
  height: 100%;
}

.edge {
  stroke: var(--task-edge);
  stroke-width: 3;
  marker-end: url(#arrowhead);
}

.connecting-line {
  stroke: var(--task-edge-connecting);
  stroke-width: 2;
  stroke-dasharray: 9, 3;
}

#help-modal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--modal-bg);
  border: 1px solid var(--modal-border);
  border-radius: 12px;
  padding: 20px;
  width: 60%;
  z-index: 20;
  backdrop-filter: blur(10px);
}

.zoom-controls {
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  z-index: 10;
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
  position: absolute;
  top: 0;
  left: 0;
  background-color: rgb(0, 0, 0, 0.8);
  width: 100vw;
  height: 100vh;
  backdrop-filter: blur(9px);
  z-index: 11;
}

.board-pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  filter: brightness(0.9);
}
.board-pane-header {
  text-align: center;
  height: 1.5em;
  align-content: center;
  color: black;
  font-weight: bold;
}
.board-pane-list {
  overflow-y: scroll;
  max-height: 100vh;
}
.board-item {
  margin-bottom: 5px;
  background: rgb(0, 0, 0, 0.3);
  padding: 5px;
  cursor: pointer;
}
.board-item:hover {
  background: rgb(0, 0, 0, 0.5);
}
</style>
