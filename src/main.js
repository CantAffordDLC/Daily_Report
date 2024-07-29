const { invoke } = window.__TAURI__.tauri;

let greetInputEl;
let greetMsgEl;

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });
});

function addTask() {
  const taskInput = document.getElementById('task');
  const taskValue = taskInput.value.trim();

  if (taskValue === '') {
    alert('Task cannot be empty!');
    return;
  }

  const taskList = document.getElementById('task-list');

  const listItem = document.createElement('li');
  const taskSpan = document.createElement('span');
  taskSpan.textContent = taskValue;
  
  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Delete';
  deleteButton.classList.add('delete-button');
  deleteButton.onclick = function() {
    taskList.removeChild(listItem);
  };

  listItem.appendChild(taskSpan);
  listItem.appendChild(deleteButton);
  taskList.appendChild(listItem);

  taskInput.value = '';
}