<script setup lang="ts">
import {computed, ref} from 'vue';
import {Task, TaskID, useDB} from '../composables/db';

const {taskID} = defineProps<{
  taskID: TaskID;
}>();
const emit = defineEmits<{
  close: [];
  reselect: [id: TaskID];
}>();

function promptInput(title: string, value: string): string {
  const result = prompt(title, value);
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
</script>

<template>
  <h2
    style="display: flex; cursor: text"
    :class="statusClass[task.status]"
    :title="task.status + ' status'"
  >
    <span
      style="flex-grow: 1"
      v-on:click="() => (task.title = promptInput('Task title', task.title))"
      >{{ task.title }} (#{{ task.id }})</span
    >
    <button id="close-btn" title="Close" v-on:click="emit('close')">X</button>
  </h2>
  <div
    class="content"
    style="cursor: text"
    v-on:click="
      () =>
        (task.description = promptInput('Task description', task.description))
    "
  >
    <p v-if="task.description">{{ task.description }}</p>
    <p v-else style="font-style: italic; color: #aaa">No description</p>
  </div>
  <table style="width: 100%">
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
</template>

<style scoped>
h2 {
  margin-bottom: 20px;
  text-align: center;
}
.pending {
  color: #ffd700;
}
.completed {
  color: #4caf50;
}
.blocked {
  color: #f44336;
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

#close-btn {
  background: rgb(120, 120, 170);
  height: 2em;
  aspect-ratio: 1;
  border: none;
  justify-content: center;
}

#close-btn:hover {
  background: #9575cd;
}
</style>
