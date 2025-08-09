<script setup lang="ts">
const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="help-content">
    <h2 class="header">TOODA Guide</h2>
    <p>
      Tooda is task management application based on Directed Acyclic Graphs
      (DAGs). Tasks can have dependencies that must be completed first.
    </p>

    <table id="help-table">
      <tbody>
        <tr>
          <td>Add Task</td>
          <td>
            Double click background or click big plus button to create new task
          </td>
        </tr>
        <tr>
          <td>Move Task</td>
          <td>Drag task header to reposition it</td>
        </tr>
        <tr>
          <td>Resize Task</td>
          <td>Drag bottom-right corner to resize</td>
        </tr>
        <tr>
          <td>Connect Tasks</td>
          <td>
            Click link icon on task, then click another task to create
            dependency
          </td>
        </tr>
        <tr>
          <td>Complete Task</td>
          <td>
            Click checkbox to mark task as completed. Note that all its
            dependencies must be completed first.
          </td>
        </tr>
        <tr>
          <td>Edit Task</td>
          <td>Double click task header to edit its title and description.</td>
        </tr>
        <tr>
          <td>Delete Task</td>
          <td>Click trash icon to remove task and its connections</td>
        </tr>
        <tr>
          <td>Pan View</td>
          <td>Drag background to move canvas</td>
        </tr>
        <tr>
          <td>Zoom</td>
          <td>Use mouse wheel or zoom buttons to zoom in/out</td>
        </tr>
      </tbody>
    </table>

    <table id="status-table">
      <tbody>
        <tr>
          <td class="status-color pending-color">Pending</td>
          <td>Task is ready to be completed</td>
        </tr>
        <tr>
          <td class="status-color completed-color">Completed</td>
          <td>Task is finished</td>
        </tr>
        <tr>
          <td class="status-color blocked-color">Blocked</td>
          <td>Dependencies not completed</td>
        </tr>
      </tbody>
    </table>

    <button id="close-help" v-on:click="emit('close')">Close</button>
  </div>
</template>

<style scoped>
.help-content {
  line-height: 1.4;
  user-select: text;
}

.header {
  margin-bottom: 10px;
  text-align: center;
}

#help-table {
  padding-top: 20px;
  width: 100%;
}

#help-table {
  border-collapse: collapse;
}
#help-table td {
  border: 1px solid var(--modal-border);
}
#help-table tr :first-child {
  font-weight: bold;
  width: 8rem;
}

.status-color {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: var(--task-fg);
  font-weight: bold;
  padding: 0px 4px;
}
.pending-color {
  background: var(--task-pending-bg);
}
.completed-color {
  background: var(--task-completed-bg);
}
.blocked-color {
  background: var(--task-blocked-bg);
}

#close-help {
  background: var(--modal-close-button-bg);
  width: 100%;
  height: 40px;
  justify-content: center;
}

#close-help:hover {
  background: var(--modal-close-button-bg-hover);
}

#status-table {
  margin-top: 20px;
  width: 100%;
}
#status-table td:nth-child(2) {
  padding-left: 20px;
}
</style>
