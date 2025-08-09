<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {parse} from 'marked';
import {Task, TaskID, useDB} from '../composables/db';

const {taskID} = defineProps<{
  taskID: TaskID;
}>();
const emit = defineEmits<{
  close: [];
  reselect: [id: TaskID];
}>();

function promptInput(value: string): string {
  const result = prompt('Task title', value);
  return result ?? value;
}

const {db} = useDB();
const task = computed(() => db.value.tasks.get(taskID)!);
const blockedBy = computed(() =>
  task.value.dependencies
    .filter((id) => db.value.tasks.get(id)!.status !== 'completed')
    .sort((a, b) => a - b),
);
const blocks = computed(() =>
  [...db.value.tasks.keys()]
    .filter((id: TaskID) =>
      db.value.tasks.get(id)!.dependencies.includes(taskID),
    )
    .sort((a, b) => a - b),
);
const statusClass: Record<Task['status'], string> = {
  pending: 'pending',
  completed: 'completed',
  blocked: 'blocked',
};
const editing = ref(false);
onMounted(() => {
  editing.value = false;
});
</script>

<template>
  <div id="task-modal" v-on:click="() => (editing = false)">
    <h2
      style="display: flex; cursor: text"
      :class="statusClass[task.status]"
      :title="task.status + ' status'"
    >
      <span
        style="flex-grow: 1"
        v-on:click="() => (task.title = promptInput(task.title))"
        >{{ task.title }} (#{{ task.id }})</span
      >
      <button id="close-btn" title="Close" v-on:click="emit('close')">X</button>
    </h2>
    <div
      class="content"
      style="cursor: text; z-index: 1"
      v-on:click.stop="() => (editing = true)"
    >
      <textarea
        v-if="editing"
        :value="task.description"
        @input="
          (v: Event) =>
            (task.description = (v.target! as HTMLTextAreaElement).value)
        "
        style="height: 10rem; width: 100%"
      />
      <p v-else-if="task.description" v-html="parse(task.description)"></p>
      <p v-else style="font-style: italic; color: #aaa">No description</p>
    </div>
    <table class="thetable">
      <tbody>
        <tr>
          <td class="column">
            Blocked by:
            <ul v-if="blockedBy.length" style="padding-left: 20px">
              <li v-for="id in blockedBy" :key="id">
                <a
                  :class="statusClass[db.tasks.get(id)!.status]"
                  class="task-item"
                  v-on:click="() => emit('reselect', id)"
                >
                  {{ db.tasks.get(id)!.title }} (#{{ id }})
                </a>
              </li>
            </ul>
            <p v-else style="font-style: italic; color: #aaa">Nothing</p>
          </td>
          <td class="column">
            Blocks:
            <ul v-if="blocks.length" style="padding-left: 20px">
              <li v-for="id in blocks" :key="id">
                <a
                  :class="statusClass[db.tasks.get(id)!.status]"
                  class="task-item"
                  v-on:click="() => emit('reselect', id)"
                >
                  {{ db.tasks.get(id)!.title }} (#{{ id }})
                </a>
              </li>
            </ul>
            <p v-else style="font-style: italic; color: #aaa">Nothing</p>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
h2 {
  margin-bottom: 20px;
  text-align: center;
}
.pending {
  color: var(--task-pending-bg);
}
.completed {
  color: var(--task-completed-bg);
}
.blocked {
  color: var(--task-blocked-bg);
}
.task-item {
  font-weight: bold;
  text-decoration: underline;
  line-height: 1.4;
  cursor: pointer;
}

.column {
  width: 50%;
  align-content: start;
}

.content {
  padding-bottom: 20px;
}

.thetable {
  width: 100%;
  user-select: text;
}

#close-btn {
  background: var(--modal-close-button-bg);
  height: 2em;
  aspect-ratio: 1;
  border: none;
  justify-content: center;
}

#close-btn:hover {
  background: var(--modal-close-button-bg-hover);
}

#task-modal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--modal-bg);
  border: 1px solid var(--modal-border);
  border-radius: 12px;
  padding: 20px;
  width: 80%;
  z-index: 40;
}
</style>
