// --- VARIABLES GLOBALES ---
// Estas variables almacenan datos de la aplicación y el estado de la UI.
let allTasks = [];
let allProjects = [];
let allNotes = [];
let allResources = [];
let allCollaborators = []; // Variable global para almacenar todos los colaboradores
let currentFocusTaskId = null; // Se inicializa aquí, se actualiza al seleccionar tarea de enfoque
let focusObjectives = []; // Se inicializa aquí, se carga con objetivos de la tarea de enfoque
let notesView = 'grid'; // Vista por defecto para las notas: 'grid' o 'list'
let projectView = 'grid'; // Vista por defecto para los proyectos: 'grid' o 'list'

// --- VARIABLES GLOBALES PARA BÚSQUEDA ---
let searchTimeout = null; // Para debounce de búsqueda
let isSearchActive = false; // Estado de búsqueda activa
let searchResults = null; // Resultados de búsqueda actuales

// --- VARIABLES GLOBALES PARA TEMPORIZADOR DE ENFOQUE ---
let focusSessionActive = false;
let pomodoroInterval = null;
let isPaused = true;
let currentMode = 'focus'; // 'focus' o 'break'

// --- MODAL PERSONALIZADO PARA ALERTAS Y CONFIRMACIONES ---
// Se añade el HTML del modal al cuerpo del documento al cargar.
document.addEventListener('DOMContentLoaded', () => {
    const modalHtml = `
        <div id="customModal" class="modal">
            <div class="modal-content">
                <span class="close-button" id="customModalCloseBtn">&times;</span>
                <h3 id="customModalTitle"></h3>
                <p id="customModalMessage"></p>
                <div class="modal-actions" id="customModalActions">
                    <button id="customModalConfirmBtn" class="btn btn-primary">Aceptar</button>
                    <button id="customModalCancelBtn" class="btn btn-secondary">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Configurar listeners para el modal personalizado
    const customModal = document.getElementById('customModal');
    const customModalCloseBtn = document.getElementById('customModalCloseBtn');
    const customModalConfirmBtn = document.getElementById('customModalConfirmBtn');
    const customModalCancelBtn = document.getElementById('customModalCancelBtn');

    if (customModalCloseBtn) customModalCloseBtn.addEventListener('click', () => customModal.classList.remove('show'));
    if (customModal) {
        customModal.addEventListener('click', (event) => {
            if (event.target === customModal) {
                customModal.classList.remove('show');
            }
        });
    }
});

/**
 * Muestra un modal de alerta personalizado.
 * @param {string} title - Título de la alerta.
 * @param {string} message - Mensaje de la alerta.
 * @returns {Promise<void>} Una promesa que se resuelve cuando el usuario cierra el modal.
 */
function showAlert(title, message) {
    return new Promise(resolve => {
        const customModal = document.getElementById('customModal');
        const customModalTitle = document.getElementById('customModalTitle');
        const customModalMessage = document.getElementById('customModalMessage');
        const customModalActions = document.getElementById('customModalActions');
        const customModalConfirmBtn = document.getElementById('customModalConfirmBtn');
        const customModalCancelBtn = document.getElementById('customModalCancelBtn');

        if (!customModal || !customModalTitle || !customModalMessage || !customModalActions || !customModalConfirmBtn || !customModalCancelBtn) {
            console.error('Elementos del modal personalizado no encontrados. Usando alert() de fallback.');
            alert(`${title}\n\n${message}`); // Fallback a alert() si los elementos no existen
            resolve();
            return;
        }

        customModalTitle.textContent = title;
        customModalMessage.textContent = message;
        customModalCancelBtn.style.display = 'none'; // Ocultar botón de cancelar para alertas
        customModalConfirmBtn.textContent = 'Aceptar'; // Asegurar texto para alerta

        const confirmHandler = () => {
            customModal.classList.remove('show');
            customModalConfirmBtn.removeEventListener('click', confirmHandler);
            resolve();
        };

        customModalConfirmBtn.addEventListener('click', confirmHandler);
        customModal.classList.add('show');
    });
}

/**
 * Muestra un modal de confirmación personalizado.
 * @param {string} title - Título de la confirmación.
 * @param {string} message - Mensaje de la confirmación.
 * @returns {Promise<boolean>} Una promesa que se resuelve con `true` si el usuario confirma, `false` si cancela.
 */
function showConfirm(title, message) {
    return new Promise(resolve => {
        const customModal = document.getElementById('customModal');
        const customModalTitle = document.getElementById('customModalTitle');
        const customModalMessage = document.getElementById('customModalMessage');
        const customModalActions = document.getElementById('customModalActions');
        const customModalConfirmBtn = document.getElementById('customModalConfirmBtn');
        const customModalCancelBtn = document.getElementById('customModalCancelBtn');

        if (!customModal || !customModalTitle || !customModalMessage || !customModalActions || !customModalConfirmBtn || !customModalCancelBtn) {
            console.error('Elementos del modal personalizado no encontrados. Usando confirm() de fallback.');
            resolve(confirm(`${title}\n\n${message}`)); // Fallback a confirm()
            return;
        }

        customModalTitle.textContent = title;
        customModalMessage.textContent = message;
        customModalCancelBtn.style.display = 'inline-block'; // Mostrar botón de cancelar para confirmaciones
        customModalConfirmBtn.textContent = 'Confirmar'; // Asegurar texto para confirmación

        const confirmHandler = () => {
            customModal.classList.remove('show');
            customModalConfirmBtn.removeEventListener('click', confirmHandler);
            customModalCancelBtn.removeEventListener('click', cancelHandler);
            resolve(true);
        };

        const cancelHandler = () => {
            customModal.classList.remove('show');
            customModalConfirmBtn.removeEventListener('click', confirmHandler);
            customModalCancelBtn.removeEventListener('click', cancelHandler);
            resolve(false);
        };

        customModalConfirmBtn.addEventListener('click', confirmHandler);
        customModalCancelBtn.addEventListener('click', cancelHandler);
        customModal.classList.add('show');
    });
}

// --- FUNCIONES AUXILIARES GENERALES ---

/**
 * Resetea el modal de tareas a su estado original (para crear una nueva tarea).
 */
function resetTaskModal() {
    const formAddTask = document.getElementById('formAddTask');
    const modalAddTask = document.getElementById('modalAddTask');
    if (!formAddTask || !modalAddTask) return;
    formAddTask.reset();
    formAddTask.removeAttribute('data-editing-task-id');
    modalAddTask.querySelector('h2').innerHTML = '<i class="fas fa-plus-circle"></i> Nueva Tarea';
    modalAddTask.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Guardar Tarea';
}

/**
 * Abre el modal para editar una tarea existente, poblando el formulario con sus datos.
 * @param {object} task - El objeto de la tarea a editar.
 */
function openModalForEdit(task) {
    resetTaskModal(); // Asegurarse de que esté limpio primero
    const formAddTask = document.getElementById('formAddTask');
    const modalAddTask = document.getElementById('modalAddTask');
    if (!formAddTask || !modalAddTask) return;

    formAddTask.setAttribute('data-editing-task-id', task.task_id);

    // Poblar el formulario
    document.getElementById('addTaskTitle').value = task.task_title || '';
    document.getElementById('addTaskDescription').value = task.description || '';
    // Formatear la fecha para el input type="date" (YYYY-MM-DD)
    if (task.due_date) {
        const date = new Date(task.due_date);
        // Ajustar por la zona horaria para evitar que la fecha cambie
        const timezoneOffset = date.getTimezoneOffset() * 60000;
        const adjustedDate = new Date(date.getTime() + timezoneOffset);
        document.getElementById('addTaskDueDate').value = adjustedDate.toISOString().split('T')[0];
    }
    document.getElementById('addTaskProject').value = task.project_id || '';
    document.getElementById('addTaskAssignedTo').value = task.assigned_to || '';
    document.getElementById('addTaskStatus').value = task.status || 'pendiente';
    document.getElementById('addTaskPriority').value = task.worseness || 'Baja';

    modalAddTask.querySelector('h2').innerHTML = '<i class="fas fa-edit"></i> Editar Tarea';
    modalAddTask.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
    openModal('modalAddTask'); // Llama a la función global openModal
}

/**
 * Aplica una clase de color a un <select> de estado de proyecto según su valor.
 * @param {HTMLElement} selectElement - El elemento <select> a colorear.
 */
function colorizeProjectStatusSelect(selectElement) {
    if (!selectElement) return;
    // Limpiar clases de estado anteriores
    selectElement.classList.remove('status-pendiente', 'status-en-progreso', 'status-completada', 'status-cancelada');
    const statusClassMap = {
        'pendiente': 'status-pendiente',
        'en progreso': 'status-en-progreso',
        'completada': 'status-completada',
        'cancelada': 'status-cancelada'
    };
    const selectedStatus = selectElement.value;
    if (statusClassMap[selectedStatus]) {
        selectElement.classList.add(statusClassMap[selectedStatus]);
    }
}

/**
 * Formatea una fecha para mostrar "hace X tiempo".
 * @param {string} dateString - La fecha en formato de cadena.
 * @returns {string} La cadena de tiempo transcurrido.
 */
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return `hace un momento`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `hace ${days} día(s)`;
}

/**
 * Abre un modal específico.
 * @param {string} modalId - El ID del modal a abrir (ej. 'modalAddTask').
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden'; // Evita el scroll del fondo
    }
}

/**
 * Cierra un modal específico.
 * @param {HTMLElement} modal - El elemento DOM del modal a cerrar.
 */
function closeModal(modal) {
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = ''; // Restaura el scroll del fondo
    }
}

// --- FUNCIONES DE CARGA Y RENDERIZADO DE DATOS (GLOBALES) ---

/**
 * Carga todas las notas del usuario desde la API y las renderiza en la vista de "Todas las Notas".
 */
async function loadAllNotes() {
    const allNotesList = document.getElementById('all-notes-list');
    if (!allNotesList) return;

    try {
        const response = await fetch('/api/notes');
        if (!response.ok) throw new Error('No se pudieron cargar las notas');
        allNotes = await response.json(); // Almacena todas las notas globalmente
        renderAllNotes(); // Renderiza las notas en la UI
    } catch (error) {
        console.error('Error al cargar todas las notas:', error);
        if (allNotesList) {
            allNotesList.innerHTML = '<div class="loading-state"><p>Error al cargar las notas</p></div>';
        }
    }
}

/**
 * Renderiza todas las notas en la sección "Todas las Notas", aplicando filtros.
 */
function renderAllNotes() {
    const allNotesList = document.getElementById('all-notes-list');
    const notesEmptyState = document.getElementById('notes-empty-state');
    const notesFilter = document.getElementById('notes-filter');
    const allNotesContainer = document.getElementById('all-notes-container');

    if (!allNotesList || !notesEmptyState) return;

    let filteredNotes = [...allNotes];
    const filterValue = notesFilter ? notesFilter.value : 'all';
    if (filterValue === 'pinned') {
        filteredNotes = allNotes.filter(note => note.is_pinned);
    } else if (filterValue === 'unpinned') {
        filteredNotes = allNotes.filter(note => !note.is_pinned);
    }
    allNotesList.innerHTML = ''; // Limpia el contenedor antes de renderizar
    if (filteredNotes.length === 0) {
        // FIX: Cambiar a 'flex' para que respete las propiedades de alineación del CSS.
        notesEmptyState.style.display = 'flex';
        allNotesList.style.display = 'none'; // Oculta la lista si no hay notas
    } else {
        notesEmptyState.style.display = 'none';
        // Alterna entre vista de lista o cuadrícula
        allNotesList.style.display = notesView === 'list' ? 'flex' : 'grid';
        if (allNotesContainer) allNotesContainer.classList.toggle('list-view', notesView === 'list');
        filteredNotes.forEach(note => addNoteCardToDOM(note)); // Usa addNoteCardToDOM para la vista general
    }
}

/**
 * Crea una tarjeta de nota para la sección completa de notas (vista de cuadrícula/lista).
 * @param {object} note - El objeto de la nota con todos sus datos.
 */
function addNoteCardToDOM(note) {
    const allNotesList = document.getElementById('all-notes-list');
    if (!allNotesList) return;

    const date = new Date(note.created_at);
    const formattedDate = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    // Ocultar acciones si el rol es 'Invitado'
    let actionButtonsHTML = '';
    if (window.user_role !== 'Invitado') {
        actionButtonsHTML = `
            <button class="note-action-btn edit-note-btn" title="Editar nota"><i class="fas fa-edit"></i></button>
            <button class="note-action-btn delete-note-btn" title="Eliminar nota"><i class="fas fa-trash-alt"></i></button>
        `;
    }

    const noteHTML = `
        <div class="note-card" data-note-id="${note.note_id}" data-is-pinned="${note.is_pinned ? 1 : 0}">
            <div class="note-card-header">
                <span class="note-date">${formattedDate}</span>
                ${note.is_pinned ? '<i class="fas fa-thumbtack pinned-icon" title="Nota anclada"></i>' : ''}
            </div>
            <div class="note-card-content">
                <p class="note-text">${note.content}</p>
            </div>
            <div class="note-card-actions">${actionButtonsHTML}</div>
        </div>
    `;

    allNotesList.insertAdjacentHTML('beforeend', noteHTML);
}

/**
 * Maneja el anclado/desanclado de notas.
 * @param {string} noteId - ID de la nota.
 * @param {boolean} currentPinState - Estado actual de anclado.
 */
async function toggleNotePin(noteId, currentPinState) {
    try {
        const response = await fetch(`/api/notes/${noteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_pinned: !currentPinState })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al actualizar la nota');
        }

        // Actualizar el estado local
        const noteIndex = allNotes.findIndex(note => note.note_id == noteId);
        if (noteIndex !== -1) {
            allNotes[noteIndex].is_pinned = !currentPinState;
        }

        // Re-renderizar
        renderAllNotes();
        loadAndRenderNotes(); // Actualizar también el dashboard

    } catch (error) {
        console.error('Error al cambiar estado de anclado:', error);
        await showAlert('Error al actualizar', `No se pudo actualizar la nota: ${error.message}`);
    }
}

/**
 * Carga todos los recursos del usuario desde la API y los renderiza.
 */
async function loadAllResources() {
    const resourceGrid = document.getElementById('resource-grid');
    if (!resourceGrid) return;

    const resourceLoadingState = resourceGrid.querySelector('.loading-state');
    const resourceEmptyState = resourceGrid.querySelector('.empty-state');

    if (resourceLoadingState) resourceLoadingState.style.display = 'flex';
    if (resourceEmptyState) resourceEmptyState.style.display = 'none';

    try {
        const response = await fetch('/api/resources');
        if (!response.ok) throw new Error('No se pudieron cargar los recursos');
        allResources = await response.json(); // Almacena todos los recursos globalmente
        renderAllResources(); // Renderiza los recursos en la UI
    } catch (error) {
        console.error('Error al cargar recursos:', error);
        if (resourceGrid) {
            resourceGrid.innerHTML = '<div class="error-state"><p>Error al cargar los recursos</p></div>';
        }
    } finally {
        if (resourceLoadingState) resourceLoadingState.style.display = 'none';
    }
}

/**
 * Renderiza todos los recursos en la sección de recursos.
 */
function renderAllResources() {
    const resourceGrid = document.getElementById('resource-grid');
    if (!resourceGrid) return;

    // Limpia el contenedor, pero mantiene los estados de carga/vacío
    const existingStates = resourceGrid.querySelectorAll('.loading-state, .empty-state');
    resourceGrid.innerHTML = '';
    existingStates.forEach(state => resourceGrid.appendChild(state));
    const resourceEmptyState = resourceGrid.querySelector('.empty-state');

    if (allResources.length === 0) {
        if (resourceEmptyState) resourceEmptyState.style.display = 'flex';
    } else {
        if (resourceEmptyState) resourceEmptyState.style.display = 'none';
        allResources.forEach(resource => addResourceCardToDOM(resource));
    }
}

/**
 * Crea una tarjeta de recurso para la sección de recursos.
 * @param {object} resource - El objeto del recurso con todos sus datos.
 */
function addResourceCardToDOM(resource) {
    const resourceGrid = document.getElementById('resource-grid');
    if (!resourceGrid) return;

    const date = new Date(resource.created_at);
    const formattedDate = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    let iconClass = 'fas fa-file';
    let typeLabel = 'Otro';

    switch (resource.type) {
        case 'document':
            iconClass = 'fas fa-file-alt pdf'; typeLabel = 'Documento'; break;
        case 'image':
            iconClass = 'fas fa-image image'; typeLabel = 'Imagen'; break;
        case 'link':
            iconClass = 'fas fa-link link'; typeLabel = 'Enlace Web'; break;
        case 'video':
            iconClass = 'fas fa-video video'; typeLabel = 'Video'; break;
    }

    // Ocultar botón de eliminar si el rol es 'Invitado'
    let deleteButtonHTML = '';
    if (window.user_role !== 'Invitado') {
        deleteButtonHTML = `<button class="action-btn small-btn delete-resource-btn" title="Eliminar recurso"><i class="fas fa-trash-alt"></i> Eliminar</button>`;
    }

    const resourceHTML = `
        <div class="card resource-card" data-resource-id="${resource.resource_id}" data-resource-type="${resource.type}">
            <div class="resource-icon-wrapper">
                <div class="resource-icon ${iconClass}">
                    <i class="${iconClass}"></i>
                </div>
            </div>
            <h4 class="resource-title">${resource.title}</h4>
            <p class="resource-meta">Tipo: ${typeLabel} | Creado: ${formattedDate}</p>
            <div class="resource-actions">
                <a href="${resource.url_or_path}" target="_blank" class="action-btn small-btn" title="Ver/Abrir recurso"><i class="fas fa-eye"></i> Ver</a>
                ${deleteButtonHTML}
            </div>
        </div>
     `;

    resourceGrid.insertAdjacentHTML('beforeend', resourceHTML);
}

/**
 * Carga las notas ancladas desde la API y las muestra en el dashboard.
 */
async function loadAndRenderNotes() {
    const importantNotesList = document.getElementById('important-notes-list');
    const viewAllNotesBtn = document.querySelector('.view-all-notes-btn');
    if (!importantNotesList) return;

    importantNotesList.innerHTML = '<p class="loading-notes">Cargando notas...</p>';

    try {
        // Solo pedimos las notas ancladas para el dashboard
        const response = await fetch('/api/notes?pinned=true');
        if (!response.ok) throw new Error('No se pudieron cargar las notas.');

        const notes = await response.json();
        importantNotesList.innerHTML = ''; // Limpiar el contenedor

        if (notes.length === 0) {
            importantNotesList.innerHTML = `
                <div class="empty-state" style="padding: 20px; min-height: 100px; border: none; box-shadow: none;">
                    <i class="fas fa-sticky-note" style="font-size: 30px;"></i>
                    <p style="font-size: 14px;">No tienes notas importantes. ¡Añade una!</p>
                </div>`;
        } else {
            notes.forEach(note => addNoteToDOM(note)); // Usa addNoteToDOM para el dashboard
        }

        // Mostrar/ocultar el botón "Ver Todas las Notas"
        const hasNotes = notes.length > 0;
        if (viewAllNotesBtn) {
            viewAllNotesBtn.style.display = hasNotes ? 'flex' : 'none';
        }

    } catch (error) {
        console.error('Error al cargar notas:', error);
        importantNotesList.innerHTML = '<p class="error-message">Error al cargar las notas.</p>';
    }
}

/**
 * Crea el HTML para una sola nota y la añade al DOM del dashboard.
 * @param {object} note - El objeto de la nota con sus datos.
 */
function addNoteToDOM(note) {
    const importantNotesList = document.getElementById('important-notes-list');
    if (!importantNotesList) return;

    const date = new Date(note.created_at);
    const formattedDate = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

    // Ocultar acciones si el rol es 'Invitado'
    let actionButtonsHTML = '';
    if (window.user_role !== 'Invitado') {
        actionButtonsHTML = `
            <button class="note-action-btn edit-note-btn" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="note-action-btn delete-note-btn" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
        `;
    }

    const noteHTML = `
        <div class="note-item" data-note-id="${note.note_id}" data-is-pinned="${note.is_pinned ? 1 : 0}">
            <p class="note-text">${note.content}</p>
            <span class="note-date">${formattedDate}</span>
            <div class="note-actions">${actionButtonsHTML}</div>
        </div>
    `;
    importantNotesList.insertAdjacentHTML('beforeend', noteHTML);
}

/**
 * Carga todas las tareas existentes desde la API y las muestra en la página,
 * aplicando filtros y ordenamiento.
 */
async function loadAndRenderTasks() {
    const taskListContainer = document.getElementById('task-list');
    if (!taskListContainer) return;
    try {
        const response = await fetch('/tasks');
        if (!response.ok) throw new Error('Error al cargar tareas');
        allTasks = await response.json(); // Guardar todas las tareas en memoria
        applyFiltersAndSort(); // Renderizar la lista inicial aplicando filtros y orden por defecto
    } catch (error) {
        console.error('Error al cargar las tareas:', error);
        taskListContainer.innerHTML = '<p class="error-message">No se pudieron cargar las tareas.</p>';
    }
}

/**
 * Crea el HTML para una sola tarea y lo añade al DOM.
 * @param {object} task - El objeto de la tarea con todos sus datos.
 */
function addTaskToDOM(task) {
    const taskListContainer = document.getElementById('task-list');
    if (!taskListContainer) return;

    // Ocultar el mensaje de "estado vacío" si está visible
    const emptyState = taskListContainer.querySelector('.empty-state');
    if (emptyState) emptyState.style.display = 'none';

    // Corregir formato de fecha
    let dueDateText = 'Sin fecha';
    if (task.due_date) {
        // Acepta tanto string como Date
        const dateObj = new Date(task.due_date);
        if (!isNaN(dateObj.getTime())) {
            dueDateText = dateObj.toLocaleDateString('es-ES', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
        }
    }

    // Mapeo de estados de tarea para visualización
    const taskStatusMap = {
        'pendiente': { label: 'Pendiente', className: 'status-pending' },
        'en_progreso': { label: 'En Progreso', className: 'status-in-progress' },
        'completada': { label: 'Completada', className: 'status-completed' }
    };
    // Si el estado no se encuentra, se muestra el valor crudo sin clase de estilo.
    const statusInfo = taskStatusMap[task.status] || { label: task.status, className: '' };
    const statusHTML = `<span class="task-status ${statusInfo.className}">${statusInfo.label}</span>`;

    // Mapeo de prioridades para visualización (los className deben coincidir con styles.css)
    const priorityMap = {
        'Baja': { label: 'Baja', className: 'low' },
        'media': { label: 'Media', className: 'medium' },
        'urgente': { label: 'Urgente', className: 'urgent' }
    };
    const priorityInfo = priorityMap[task.worseness] || { label: task.worseness, className: '' };
    const priorityHTML = task.worseness ? `<span class="task-priority ${priorityInfo.className}"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> ${priorityInfo.label}</span>` : '';

    // Ocultar acciones si el rol es 'Invitado'
    let actionButtonsHTML = '';
    if (window.user_role !== 'Invitado') {
        actionButtonsHTML = `
            <button class="task-action-btn edit-task-btn" aria-label="Editar tarea"><i class="fas fa-edit"></i></button>
            <button class="task-action-btn delete-task-btn" aria-label="Eliminar tarea"><i class="fas fa-trash-alt"></i></button>
        `;
    }

    const taskHTML = `
        <div class="task-item ${task.status === 'completada' ? 'completed' : ''}" data-task-id="${task.task_id}">
            <input type="checkbox" class="task-checkbox" ${task.status === 'completada' ? 'checked' : ''} aria-label="Marcar tarea como completada">
            <div class="task-details">
                <h4 class="task-title">${task.task_title}</h4>
                <p class="task-meta"><i class="fas fa-calendar-alt" aria-hidden="true"></i> Vence: ${dueDateText} | <i class="fas fa-project-diagram" aria-hidden="true"></i> Proyecto: ${task.project_name || 'N/A'}</p>
                ${task.description ? `<p class="task-description">${task.description}</p>` : ''}
            </div>
            <div class="task-actions">
                ${priorityHTML}
                ${statusHTML}
                ${actionButtonsHTML}
            </div>
        </div>
    `;
    // Insertar al principio para ver las tareas más nuevas primero
    taskListContainer.insertAdjacentHTML('afterbegin', taskHTML);
}

/**
 * Aplica los filtros y el ordenamiento a la lista de tareas y las renderiza.
 */
function applyFiltersAndSort() {
    const taskListContainer = document.getElementById('task-list');
    const sortTasksSelect = document.getElementById('sortTasksSelect');
    const activeFilterOption = document.querySelector('.filters-bar .filter-option.active');
    const filter = activeFilterOption ? activeFilterOption.getAttribute('data-filter') : 'all';
    const sortBy = sortTasksSelect ? sortTasksSelect.value : '';

    let tasksToRender = [...allTasks];

    // 1. Aplicar Filtro
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (filter === 'today') {
        tasksToRender = tasksToRender.filter(task => {
            if (!task.due_date) return false;
            const due = new Date(task.due_date);
            // FIX: Ajustar por la zona horaria para evitar errores de un día.
            // new Date('YYYY-MM-DD') se interpreta como UTC, lo que puede causar
            // que la fecha sea del día anterior en zonas horarias locales.
            const timezoneOffset = due.getTimezoneOffset() * 60000;
            const localDue = new Date(due.getTime() + timezoneOffset);
            localDue.setHours(0, 0, 0, 0);
            return localDue.getTime() === today.getTime();
        });
    } else if (filter === 'next-7-days') {
        const next7 = new Date(today);
        next7.setDate(today.getDate() + 7);
        tasksToRender = tasksToRender.filter(task => {
            if (!task.due_date) return false;
            const due = new Date(task.due_date);
            // FIX: Aplicar el mismo ajuste de zona horaria aquí.
            const timezoneOffset = due.getTimezoneOffset() * 60000;
            const localDue = new Date(due.getTime() + timezoneOffset);
            localDue.setHours(0, 0, 0, 0);
            return localDue >= today && localDue <= next7;
        });
    } else if (filter === 'completed') {
        tasksToRender = tasksToRender.filter(task => task.status === 'completada');
    } else if (filter === 'urgent') {
        tasksToRender = tasksToRender.filter(task => task.worseness === 'urgente');
    }

    // 2. Aplicar Ordenamiento
    if (sortBy) {
        const priorityMap = { 'urgente': 3, 'media': 2, 'Baja': 1 };
        const statusMap = { 'completada': 3, 'en_progreso': 2, 'pendiente': 1 };

        tasksToRender.sort((a, b) => {
            switch (sortBy) {
                case 'priority-desc':
                    return (priorityMap[b.worseness] || 0) - (priorityMap[a.worseness] || 0);
                case 'priority-asc':
                    return (priorityMap[a.worseness] || 0) - (priorityMap[b.worseness] || 0);
                case 'status-desc': // Pendiente primero
                    return (statusMap[a.status] || 0) - (statusMap[b.status] || 0);
                case 'status-asc': // Completado primero
                    return (statusMap[b.status] || 0) - (statusMap[a.status] || 0);
                default:
                    return 0;
            }
        });
    }

    // 3. Renderizar la lista final
    renderTaskList(tasksToRender);
}

/**
 * Renderiza la lista de tareas en el DOM.
 * @param {Array} tasks - Array de tareas a renderizar.
 */
function renderTaskList(tasks) {
    const taskListContainer = document.getElementById('task-list');
    if (!taskListContainer) return;
    taskListContainer.innerHTML = '';
    if (!tasks || tasks.length === 0) {
        taskListContainer.innerHTML = `
            <div class="empty-state" style="display: flex;">
                <i class="fas fa-tasks-alt" aria-hidden="true"></i>
                <p>No hay tareas que coincidan con tu selección.</p>
            </div>`;
    } else {
        tasks.forEach(task => addTaskToDOM(task));
    }
}

/**
 * Carga los colaboradores desde la API y los renderiza en el DOM.
 */
async function loadAndRenderCollaborators() {
    const collaboratorList = document.getElementById('collaborator-list');
    if (!collaboratorList) return;

    collaboratorList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando colaboradores...</p></div>'; // Mensaje de carga

    try {
        const response = await fetch('/api/collaborators');
        if (!response.ok) {
            throw new Error('Respuesta del servidor no fue OK.');
        }
        allCollaborators = await response.json(); // Guardar en caché

        populateRoleFilter(); // Poblar el selector de filtros
        applyCollaboratorFilters(); // Aplicar filtros iniciales (ninguno) y renderizar

    } catch (error) {
        console.error('Error al cargar colaboradores:', error);
        collaboratorList.innerHTML = '<div class="loading-state"><p>Error al cargar los colaboradores.</p></div>';
    }
}

/**
 * Popula el selector de filtro de roles con roles únicos de la lista de colaboradores.
 */
function populateRoleFilter() {
    const collaboratorRoleFilter = document.getElementById('collaborator-role-filter');
    if (!collaboratorRoleFilter) return;

    // Mantener la opción "Todos los roles" y limpiar el resto
    collaboratorRoleFilter.innerHTML = '<option value="all">Todos los roles</option>';

    // Si no hay colaboradores, no agregar más opciones
    if (!allCollaborators || allCollaborators.length === 0) return;

    const roles = [...new Set(allCollaborators.map(c => c.role || 'Colaborador'))];

    roles.sort().forEach(role => {
        const option = document.createElement('option');
        // FIX: Usar un valor en minúsculas para un filtrado consistente y predecible.
        option.value = role.toLowerCase();
        option.textContent = role;
        collaboratorRoleFilter.appendChild(option);
    });
}

/**
 * Filtra los colaboradores según la búsqueda y el rol, y luego los renderiza.
 */
function applyCollaboratorFilters() {
    const collaboratorList = document.getElementById('collaborator-list');
    const collaboratorSearchInput = document.getElementById('collaborator-search-input');
    const collaboratorRoleFilter = document.getElementById('collaborator-role-filter');
    if (!collaboratorList) return;

    const searchTerm = collaboratorSearchInput ? collaboratorSearchInput.value.toLowerCase() : '';
    const selectedRole = collaboratorRoleFilter ? collaboratorRoleFilter.value : 'all';

    const filteredCollaborators = allCollaborators.filter(collaborator => {
        const fullName = `${collaborator.first_name || ''} ${collaborator.last_name || ''}`.trim().toLowerCase();
        const role = (collaborator.role || 'Colaborador').toLowerCase(); // Unificar y usar esta variable

        const matchesSearch = fullName.includes(searchTerm) || role.includes(searchTerm);
        // FIX: El valor del select ya está en minúsculas, por lo que la comparación es directa.
        const matchesRole = selectedRole === 'all' || role === selectedRole;

        return matchesSearch && matchesRole;
    });

    renderCollaboratorList(filteredCollaborators);
}

/**
 * Renderiza una lista de colaboradores en el DOM.
 * @param {Array} collaboratorsToRender - El array de objetos de colaborador a mostrar.
 */
function renderCollaboratorList(collaboratorsToRender) {
    const collaboratorList = document.getElementById('collaborator-list');
    if (!collaboratorList) return;

    collaboratorList.innerHTML = '';

    if (collaboratorsToRender.length === 0) {
        collaboratorList.innerHTML = `
            <div class="empty-state" style="display: flex;">
                <i class="fas fa-user-slash" aria-hidden="true"></i>
                <p>No se encontraron colaboradores que coincidan con tu búsqueda.</p>
            </div>`;
    } else {
        collaboratorsToRender.forEach(collab => addCollaboratorToDOM(collab));
    }
}

/**
 * Crea la tarjeta HTML para un solo colaborador y la añade al DOM.
 * @param {object} collaborator - El objeto del colaborador con sus datos.
 */
function addCollaboratorToDOM(collaborator) {
    const collaboratorList = document.getElementById('collaborator-list');
    if (!collaboratorList) return;

    // Usar un avatar por defecto si no se proporciona uno
    const avatarUrl = collaborator.avatar_url || '/static/images/user-avatar.webp'; // Ruta estática corregida
    const fullName = `${collaborator.first_name || ''} ${collaborator.last_name || ''}`.trim() || collaborator.username;

    // Crear el botón de contacto dinámicamente.
    let contactButtonHTML;
    // Solo mostrar el botón de contactar si no es un invitado y tiene email
    if (window.user_role !== 'Invitado' && collaborator.Email) {
        // Preparamos un asunto y cuerpo para el correo. Usamos encodeURIComponent para manejar espacios y caracteres especiales.
        const subject = encodeURIComponent(`Contacto desde TaskManager Pro`);
        const body = encodeURIComponent(
`Hola ${collaborator.first_name || collaborator.username},

Te escribo desde la plataforma TaskManager Pro para...

Saludos cordiales,
${window.current_user_name || 'Usuario de TaskManager Pro'}`
        );

        contactButtonHTML = `<a href="mailto:${collaborator.Email}?subject=${subject}&body=${body}" class="action-btn" aria-label="Contactar a ${fullName}">
            <i class="fas fa-envelope"></i> Contactar
        </a>`;
    } else {
        contactButtonHTML = `<button class="action-btn" aria-label="No se puede contactar a ${fullName}" disabled title="No hay email disponible">
               <i class="fas fa-envelope-slash"></i> Contactar
           </button>`;
    }

    // --- Botones de administración (solo para administradores, excepto a sí mismo) ---
    let adminButtonsHTML = '';
    if (window.user_role === 'Administrador' && window.user_id != collaborator.user_id) {
        // Botón de bloquear/desbloquear
        if (collaborator.is_blocked) {
            adminButtonsHTML += `<button class="action-btn unblock-user-btn" data-user-id="${collaborator.user_id}" title="Desbloquear usuario"><i class="fas fa-unlock"></i> Desbloquear</button>`;
        } else {
            adminButtonsHTML += `<button class="action-btn block-user-btn" data-user-id="${collaborator.user_id}" title="Bloquear usuario"><i class="fas fa-ban"></i> Bloquear</button>`;
        }
        // Botón de eliminar
        adminButtonsHTML += `<button class="action-btn delete-user-btn" data-user-id="${collaborator.user_id}" title="Eliminar usuario"><i class="fas fa-user-times"></i> Eliminar</button>`;
    }

    const collaboratorCard = document.createElement('div');
    collaboratorCard.className = 'card collaborator-card';
    collaboratorCard.dataset.collabId = collaborator.user_id;

    collaboratorCard.innerHTML = `
        <img src="${avatarUrl}" alt="Avatar de ${fullName}" class="collaborator-avatar">
        <h4 class="collaborator-name">${fullName}</h4>
        <p class="collaborator-role">${collaborator.role || 'Colaborador'}</p>
        <div class="collaborator-stats">
            <span>
                <i class="fas fa-tasks" aria-hidden="true"></i>
                ${collaborator.assigned_tasks_count} Tareas Asignadas
            </span>
            <span>
                <i class="fas fa-project-diagram" aria-hidden="true"></i>
                ${collaborator.involved_projects_count} Proyectos
            </span>
        </div>
        <div class="collaborator-actions">
            ${contactButtonHTML}
            <button class="action-btn view-profile-btn" data-user-id="${collaborator.user_id}" aria-label="Ver perfil de ${fullName}">
                <i class="fas fa-info-circle"></i> Perfil
            </button>
            ${adminButtonsHTML}
        </div>
    `;
    // --- Listeners para los botones de administración ---
    if (window.user_role === 'Administrador' && window.user_id != collaborator.user_id) {
        // Bloquear/desbloquear
        const blockBtn = collaboratorCard.querySelector('.block-user-btn');
        const unblockBtn = collaboratorCard.querySelector('.unblock-user-btn');
        if (blockBtn) {
            blockBtn.addEventListener('click', async () => {
                const confirmed = await showConfirm('Confirmar bloqueo', '¿Seguro que deseas bloquear a este usuario?');
                if (!confirmed) return;
                try {
                    const resp = await fetch(`/api/users/${collaborator.user_id}/block`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_blocked: true })
                    });
                    const result = await resp.json();
                    if (!resp.ok) throw new Error(result.error || 'Error desconocido');
                    await showAlert('Usuario bloqueado', result.message);
                    await loadAndRenderCollaborators();
                } catch (e) {
                    await showAlert('Error', e.message);
                }
            });
        }
        if (unblockBtn) {
            unblockBtn.addEventListener('click', async () => {
                const confirmed = await showConfirm('Confirmar desbloqueo', '¿Seguro que deseas desbloquear a este usuario?');
                if (!confirmed) return;
                try {
                    const resp = await fetch(`/api/users/${collaborator.user_id}/block`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_blocked: false })
                    });
                    const result = await resp.json();
                    if (!resp.ok) throw new Error(result.error || 'Error desconocido');
                    await showAlert('Usuario desbloqueado', result.message);
                    await loadAndRenderCollaborators();
                } catch (e) {
                    await showAlert('Error', e.message);
                }
            });
        }
        // Eliminar usuario
        const deleteBtn = collaboratorCard.querySelector('.delete-user-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                const confirmed = await showConfirm('Confirmar eliminación', '¿Seguro que deseas eliminar a este usuario? Esta acción no se puede deshacer.');
                if (!confirmed) return;
                try {
                    const resp = await fetch(`/api/users/${collaborator.user_id}`, {
                        method: 'DELETE'
                    });
                    const result = await resp.json();
                    if (!resp.ok) throw new Error(result.error || 'Error desconocido');
                    await showAlert('Usuario eliminado', result.message);
                    await loadAndRenderCollaborators();
                } catch (e) {
                    await showAlert('Error', e.message);
                }
            });
        }
    }
    collaboratorList.appendChild(collaboratorCard);
}

/**
 * Muestra el perfil de un colaborador en un modal.
 * @param {string} userId - El ID del usuario a mostrar.
 */
async function showCollaboratorProfile(userId) {
    const modalCollaboratorProfile = document.getElementById('modalCollaboratorProfile');
    const profileContentContainer = document.getElementById('profile-content-container');
    if (!modalCollaboratorProfile || !profileContentContainer) return;

    // 1. Mostrar estado de carga y abrir modal
    profileContentContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando perfil...</p>
        </div>`;
    openModal('modalCollaboratorProfile');

    // 2. Obtener los datos del perfil y los roles disponibles (si es admin)
    try {
        const fetchPromises = [fetch(`/api/users/${userId}/details`)];
        if (window.user_role === 'Administrador') {
            fetchPromises.push(fetch('/api/roles'));
        }

        const responses = await Promise.all(fetchPromises);

        const profileResponse = responses[0];
        if (!profileResponse.ok) {
            const errorData = await profileResponse.json();
            throw new Error(errorData.error || 'No se pudo cargar el perfil.');
        }
        const profileData = await profileResponse.json();

        let availableRoles = [];
        if (responses.length > 1) {
            const rolesResponse = responses[1];
            if (rolesResponse.ok) {
                availableRoles = await rolesResponse.json();
            }
        }

        // 3. Renderizar el contenido del perfil
        renderCollaboratorProfile(profileData, availableRoles);

    } catch (error) {
        console.error('Error al mostrar perfil de colaborador:', error);
        profileContentContainer.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error al cargar el perfil: ${error.message}</p>
            </div>`;
    }
}

/**
 * Construye el HTML del perfil del colaborador y lo inserta en el modal.
 * @param {object} data - Los datos del perfil del colaborador.
 */
function renderCollaboratorProfile(data, availableRoles = []) {
    const profileContentContainer = document.getElementById('profile-content-container');
    if (!profileContentContainer) return;

    const avatarUrl = data.avatar_url || '/static/images/user-avatar.webp';
    const fullName = `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.username;

    // --- HTML para la gestión de roles (solo para administradores) ---
    let roleManagementHTML = '';
    // Los administradores no pueden cambiar su propio rol desde este modal para evitar bloqueos.
    if (window.user_role === 'Administrador' && window.user_id != data.user_id) {
        const roleOptions = availableRoles.map(role =>
            `<option value="${role}" ${data.role === role ? 'selected' : ''}>${role}</option>`
        ).join('');

        roleManagementHTML = `
            <div class="profile-role-management">
                <h4><i class="fas fa-user-shield"></i> Cambiar Rol de Usuario</h4>
                <div class="role-change-form" data-user-id="${data.user_id}">
                    <select id="profileRoleSelect">
                        ${roleOptions}
                    </select>
                    <button id="saveRoleChangeBtn" class="action-btn"><i class="fas fa-save"></i> Guardar</button>
                </div>
            </div>
        `;
    }

    // Formatear lista de tareas activas
    let activeTasksHTML = '<p>No tiene tareas activas asignadas.</p>';
    if (data.active_tasks && data.active_tasks.length > 0) {
        activeTasksHTML = '<ul>';
        data.active_tasks.forEach(task => {
            const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Sin fecha';
            activeTasksHTML += `<li><span>${task.task_title}</span><span class="task-due-date">Vence: ${dueDate}</span></li>`;
        });
        activeTasksHTML += '</ul>';
    }

    const profileHTML = `
        <div class="profile-header">
            <img src="${avatarUrl}" alt="Avatar de ${fullName}" class="profile-avatar">
            <div class="profile-info">
                <h2>${fullName}</h2>
                <p>${data.role || 'Colaborador'}</p>
                ${data.Email ? `<p class="profile-email"><i class="fas fa-envelope"></i> ${data.Email}</p>` : ''}
            </div>
        </div>
        <div class="profile-body">
            ${roleManagementHTML}
            <div class="profile-stats"><h3><i class="fas fa-chart-bar"></i> Estadísticas</h3><div class="profile-stats-grid"><div class="stat-item"><h4>Tareas Asignadas</h4><span class="stat-value">${data.assigned_tasks_count}</span></div><div class="stat-item"><h4>Proyectos Involucrados</h4><span class="stat-value">${data.involved_projects_count}</span></div></div></div>
            <div class="profile-active-tasks"><h3><i class="fas fa-tasks"></i> Tareas Activas Recientes</h3>${activeTasksHTML}</div>
        </div>`;

    profileContentContainer.innerHTML = profileHTML;

    // --- Event Listener para guardar el cambio de rol ---
    const saveRoleBtn = document.getElementById('saveRoleChangeBtn');
    if (saveRoleBtn) {
        saveRoleBtn.addEventListener('click', async () => {
            const form = saveRoleBtn.closest('.role-change-form');
            const userIdToUpdate = form.dataset.userId;
            const newRole = form.querySelector('#profileRoleSelect').value;

            const confirmed = await showConfirm('Confirmar Cambio de Rol', `¿Estás seguro de que quieres cambiar el rol de este usuario a "${newRole}"?`);
            if (!confirmed) return;

            try {
                const response = await fetch(`/api/users/${userIdToUpdate}/role`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: newRole })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Error desconocido');

                await showAlert('Éxito', result.message);
                // Actualizar la UI
                // 1. Actualizar el texto del rol en el modal
                const profileInfoP = document.querySelector('.profile-info p');
                if (profileInfoP) profileInfoP.textContent = newRole;
                // 2. Recargar la lista de colaboradores para reflejar el cambio
                await loadAndRenderCollaborators();

            } catch (error) {
                await showAlert('Error', `No se pudo cambiar el rol: ${error.message}`);
            }
        });
    }
}

/**
 * Carga las tareas pendientes para el selector de modo enfoque (Pomodoro).
 */
async function loadTasksForFocus() {
    const taskToFocusSelect = document.getElementById('task-to-focus');
    if (!taskToFocusSelect) return;

    try {
        const response = await fetch('/tasks');
        if (!response.ok) throw new Error('Error al cargar tareas');
        const tasks = await response.json();
        const pendingTasks = tasks.filter(task => task.status !== 'completada'); // Solo tareas no completadas
        taskToFocusSelect.innerHTML = '<option value="">Selecciona una tarea...</option>';
        pendingTasks.forEach(task => {
            const option = document.createElement('option');
            option.value = task.task_id;
            option.textContent = `${task.task_title} ${task.project_name ? `(${task.project_name})` : ''}`;
            taskToFocusSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Error al cargar tareas para enfoque:', error);
    }
}

/**
 * Carga y muestra las estadísticas de enfoque del usuario.
 * @param {number} days - Número de días para las estadísticas.
 */
async function loadFocusStats(days = 30) {
    const statsContainer = document.getElementById('focus-stats-container');
    if (!statsContainer) return;
    statsContainer.innerHTML = '<p>Cargando estadísticas...</p>';
    try {
        const response = await fetch(`/api/focus/stats?days=${days}`);
        if (response.ok) {
            const stats = await response.json();
            const html = `
                <div class="focus-stats-grid">
                    <div class="stat-item"><h4>Tiempo Total</h4><span class="stat-value">${stats.total_focus_minutes}m</span></div>
                    <div class="stat-item"><h4>Sesiones</h4><span class="stat-value">${stats.total_sessions}</span></div>
                    <div class="stat-item"><h4>Promedio</h4><span class="stat-value">${stats.avg_session_duration}m</span></div>
                    <div class="stat-item"><h4>Objetivos</h4><span class="stat-value">${stats.completed_objectives}/${stats.total_objectives}</span></div>
                    <div class="stat-item"><h4>Tasa Éxito</h4><span class="stat-value">${stats.objective_completion_rate}%</span></div>
                </div>
                ${stats.top_focused_tasks && stats.top_focused_tasks.length > 0 ? `
                <div class="top-tasks">
                    <h4>Tareas Más Enfocadas</h4>
                    <ul>${stats.top_focused_tasks.map(task => `<li>${task.task_title}: ${task.total_minutes}m</li>`).join('')}</ul>
                </div>` : '<p class="no-top-tasks">No hay tareas enfocadas recientemente.</p>'}
            `;
            statsContainer.innerHTML = html;
        } else {
            statsContainer.innerHTML = '<p style="color:red;">Error al cargar estadísticas.</p>';
        }
    } catch (error) {
        statsContainer.innerHTML = '<p style="color:red;">Error de red al cargar estadísticas.</p>';
    }
}

/**
 * Carga las tareas pendientes en el selector de modo enfoque.
 */
async function populateFocusTaskSelect() {
    const taskToFocusSelect = document.getElementById('task-to-focus');
    if (!taskToFocusSelect) return;
    taskToFocusSelect.innerHTML = '<option value="">Selecciona una tarea...</option>';
    try {
        const resp = await fetch('/tasks');
        if (!resp.ok) throw new Error('No se pudieron cargar las tareas');
        const tasks = await resp.json();
        tasks.forEach(task => {
            const option = document.createElement('option');
            option.value = task.task_id;
            option.textContent = task.task_title || task.title || 'Tarea sin título';
            taskToFocusSelect.appendChild(option);
        });
    } catch (e) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Error al cargar tareas';
        taskToFocusSelect.appendChild(opt);
    }
}

/**
 * Carga objetivos de la tarea seleccionada.
 * @param {string} taskId - ID de la tarea.
 */
async function loadFocusObjectives(taskId) {
    const focusObjectivesList = document.getElementById('focusObjectivesList');
    if (!focusObjectivesList) return;
    focusObjectivesList.innerHTML = '';
    if (!taskId) return;
    try {
        const resp = await fetch(`/focus_objectives/${taskId}`);
        if (!resp.ok) throw new Error('No se pudieron cargar los objetivos');
        focusObjectives = await resp.json();
        renderFocusObjectives();
    } catch (e) {
        focusObjectivesList.innerHTML = '<li style="color:red;">Error al cargar objetivos</li>';
    }
}

/**
 * Renderiza la lista de objetivos de enfoque.
 */
function renderFocusObjectives() {
    const focusObjectivesList = document.getElementById('focusObjectivesList');
    if (!focusObjectivesList) return;

    focusObjectivesList.innerHTML = '';
    if (!focusObjectives || focusObjectives.length === 0) {
        focusObjectivesList.innerHTML = '<li style="color:#888;">No hay objetivos para esta tarea.</li>';
        return;
    }
    focusObjectives.forEach(obj => {
        const li = document.createElement('li');
        li.className = 'focus-objective-item' + (obj.completed ? ' completed' : '');
        li.dataset.objectiveId = obj.objective_id;
        li.innerHTML = `
            <input type="checkbox" class="focus-objective-check" ${obj.completed ? 'checked' : ''} title="Marcar como completado">
            <span class="focus-objective-text" contenteditable="true" spellcheck="true">${obj.objective_text}</span>
            <button class="focus-objective-delete" title="Eliminar objetivo" style="margin-left:6px;"><i class="fas fa-trash-alt"></i></button>
        `;
        focusObjectivesList.appendChild(li);
    });
}

/**
 * Inicia una nueva sesión de enfoque en el backend.
 * @returns {Promise<object|null>} El objeto de la sesión si se inició, o null en caso contrario.
 */
async function startFocusSession() {
    const taskToFocusSelect = document.getElementById('task-to-focus');
    if (!taskToFocusSelect || !taskToFocusSelect.value) {
        await showAlert('Tarea Requerida', 'Por favor selecciona una tarea antes de iniciar el modo enfoque.');
        return null; // FIX: Devolver null para una comprobación más clara.
    }
    currentFocusTaskId = taskToFocusSelect.value; // Asigna la tarea seleccionada

    try {
        const response = await fetch('/api/focus/start_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: currentFocusTaskId })
        });

        if (response.ok) {
            const data = await response.json();
            // No mostramos la alerta aquí, se mostrará en la función que llama.
            return data; // FIX: Devolver los datos de la sesión en caso de éxito.
        } else {
            const error = await response.json();
            await showAlert('Error al iniciar sesión', 'Error al iniciar sesión: ' + error.error);
            return null;
        }
    } catch (error) {
        await showAlert('Error de Conexión', 'Error de conexión al iniciar sesión.');
        return null;
    }
}

/**
 * Finaliza la sesión de enfoque actual en el backend.
 * @returns {Promise<object|undefined>} Datos de la sesión finalizada o undefined.
 */
async function endFocusSession() {
    // currentFocusSessionId y focusSessionActive son variables locales de DOMContentLoaded
    // if (!focusSessionActive || !currentFocusSessionId) return;
    try {
        const response = await fetch('/api/focus/end_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
            const data = await response.json();
            await showAlert('Sesión Finalizada', `Sesión completada: ${data.duration_minutes} minutos de enfoque.`);
            // currentFocusSessionId = null;
            // focusSessionActive = false;
            // updateFocusUI('inactive');
            // loadChartJsAndRenderAnalytics(); // updateFocusUI y loadChartJsAndRenderAnalytics son locales
            // loadFocusStats(); // loadFocusStats es global
            return data;
        } else {
            const error = await response.json();
            await showAlert('Error al finalizar sesión', 'Error al finalizar sesión: ' + error.error);
        }
    } catch (error) {
        await showAlert('Error de Conexión', 'Error de conexión al finalizar sesión.');
    }
}

/**
 * Actualiza el estado visual de los botones del temporizador de enfoque.
 * @param {string} state - 'active', 'paused', 'inactive'.
 */
function updateFocusUI(state) {
    const focusElements = {
        startBtn: document.getElementById('start-timer'),
        pauseBtn: document.getElementById('pause-timer'),
        resetBtn: document.getElementById('reset-timer'),
        statusDisplay: document.getElementById('timer-status')
    };
    if (!focusElements.startBtn) return; // Asegurarse de que los elementos existen
    focusElements.startBtn.disabled = state === 'active';
    focusElements.pauseBtn.disabled = state !== 'active';
    focusElements.resetBtn.disabled = state === 'inactive';
    if (focusElements.statusDisplay) {
        if (state === 'active') focusElements.statusDisplay.textContent = 'Sesión activa - ¡Enfócate!';
        else if (state === 'paused') focusElements.statusDisplay.textContent = 'Pausado';
        else focusElements.statusDisplay.textContent = '¡Listo para empezar!';
    }
}

/**
 * Muestra un mensaje temporal en la sección de enfoque.
 * @param {string} message - Mensaje a mostrar.
 * @param {string} type - Tipo de mensaje ('info', 'success', 'warning', 'error').
 */
function showFocusMessage(message, type = 'info') {
    const container = document.getElementById('focus-messages');
    if (!container) return;
    const messageEl = document.createElement('div');
    messageEl.className = `focus-message ${type}`;
    messageEl.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'times-circle'}"></i><span>${message}</span><button class="close-message" onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(messageEl);
    setTimeout(() => messageEl.remove(), 5000); // El mensaje desaparece después de 5 segundos
}

/**
 * Actualiza la visualización del temporizador (minutos y segundos).
 * @param {number} timeRemaining - Tiempo restante en segundos.
 */
function updateTimerDisplay(timeRemaining) {
    const minutesDisplay = document.getElementById('minutes');
    const secondsDisplay = document.getElementById('seconds');
    if (!minutesDisplay || !secondsDisplay) return;
    const minutes = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const seconds = (timeRemaining % 60).toString().padStart(2, '0');
    minutesDisplay.textContent = minutes;
    secondsDisplay.textContent = seconds;
}

// --- FUNCIONES DE BÚSQUEDA GLOBAL ---

/**
 * Realiza una búsqueda global en tareas, proyectos y notas.
 * @param {string} searchTerm - Término de búsqueda.
 * @param {string} searchType - Tipo de búsqueda ('all', 'tasks', 'projects', 'notes').
 * @returns {Promise<object|null>} Resultados de búsqueda o null si hay error.
 */
async function performGlobalSearch(searchTerm, searchType = 'all') {
    if (!searchTerm || searchTerm.length < 2) {
        return null;
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}&type=${searchType}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error en la búsqueda');
        }
        return await response.json();
    } catch (error) {
        console.error('Error en búsqueda global:', error);
        return null;
    }
}

/**
 * Renderiza los resultados de búsqueda en un modal o contenedor específico.
 * @param {object} results - Resultados de búsqueda de la API.
 */
function renderSearchResults(results) {
    if (!results) return;

    // Crear modal de resultados si no existe
    let searchModal = document.getElementById('searchResultsModal');
    if (!searchModal) {
        const modalHTML = `
            <div id="searchResultsModal" class="modal search-modal">
                <div class="modal-content search-modal-content">
                    <div class="search-modal-header">
                        <h3 id="searchModalTitle">Resultados de búsqueda</h3>
                        <span class="close-button" id="searchModalCloseBtn">&times;</span>
                    </div>
                    <div class="search-modal-body" id="searchModalBody">
                        <!-- Contenido de resultados -->
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        searchModal = document.getElementById('searchResultsModal');
        
        // Configurar evento de cierre
        const closeBtn = document.getElementById('searchModalCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                searchModal.classList.remove('show');
                isSearchActive = false;
            });
        }
        
        // Cerrar al hacer clic fuera del modal
        searchModal.addEventListener('click', (event) => {
            if (event.target === searchModal) {
                searchModal.classList.remove('show');
                isSearchActive = false;
            }
        });
    }

    const modalTitle = document.getElementById('searchModalTitle');
    const modalBody = document.getElementById('searchModalBody');
    
    if (!modalTitle || !modalBody) return;

    // Actualizar título
    modalTitle.textContent = `Resultados para "${results.query}" (${results.total_results} encontrados)`;

    // Limpiar contenido anterior
    modalBody.innerHTML = '';

    if (results.total_results === 0) {
        modalBody.innerHTML = `
            <div class="search-empty-state">
                <i class="fas fa-search"></i>
                <h4>No se encontraron resultados</h4>
                <p>Intenta con otros términos de búsqueda</p>
            </div>
        `;
    } else {
        // Renderizar secciones de resultados
        if (results.tasks && results.tasks.length > 0) {
            modalBody.appendChild(createSearchSection('Tareas', results.tasks, 'task'));
        }
        
        if (results.projects && results.projects.length > 0) {
            modalBody.appendChild(createSearchSection('Proyectos', results.projects, 'project'));
        }
        
        if (results.notes && results.notes.length > 0) {
            modalBody.appendChild(createSearchSection('Notas', results.notes, 'note'));
        }
    }

    // Mostrar modal
    searchModal.classList.add('show');
    isSearchActive = true;
}

/**
 * Crea una sección de resultados para un tipo específico.
 * @param {string} title - Título de la sección.
 * @param {Array} items - Items a mostrar.
 * @param {string} type - Tipo de item ('task', 'project', 'note').
 * @returns {HTMLElement} Elemento DOM de la sección.
 */
function createSearchSection(title, items, type) {
    const section = document.createElement('div');
    section.className = 'search-results-section';
    
    const sectionTitle = document.createElement('h4');
    sectionTitle.className = 'search-section-title';
    sectionTitle.innerHTML = `<i class="fas fa-${getIconForType(type)}"></i> ${title} (${items.length})`;
    section.appendChild(sectionTitle);
    
    const itemsList = document.createElement('div');
    itemsList.className = 'search-results-list';
    
    items.forEach(item => {
        const itemElement = createSearchResultItem(item, type);
        itemsList.appendChild(itemElement);
    });
    
    section.appendChild(itemsList);
    return section;
}

/**
 * Obtiene el icono apropiado para cada tipo de resultado.
 * @param {string} type - Tipo de resultado.
 * @returns {string} Clase del icono.
 */
function getIconForType(type) {
    switch (type) {
        case 'task': return 'tasks';
        case 'project': return 'project-diagram';
        case 'note': return 'sticky-note';
        default: return 'file';
    }
}

/**
 * Crea un elemento individual de resultado de búsqueda.
 * @param {object} item - Item de resultado.
 * @param {string} type - Tipo de item.
 * @returns {HTMLElement} Elemento DOM del resultado.
 */
function createSearchResultItem(item, type) {
    const resultItem = document.createElement('div');
    resultItem.className = 'search-result-item';
    
    let content = '';
    let actions = '';
    
    switch (type) {
        case 'task':
            const dueDate = item.due_date ? new Date(item.due_date).toLocaleDateString('es-ES') : 'Sin fecha';
            const priorityClass = item.priority ? item.priority.toLowerCase() : 'low';
            content = `
                <div class="search-item-header">
                    <h5 class="search-item-title">${item.task_title}</h5>
                    <span class="search-item-priority priority-${priorityClass}">${item.priority || 'Baja'}</span>
                </div>
                <p class="search-item-description">${item.description || 'Sin descripción'}</p>
                <div class="search-item-meta">
                    <span><i class="fas fa-calendar"></i> Vence: ${dueDate}</span>
                    ${item.project_name ? `<span><i class="fas fa-folder"></i> ${item.project_name}</span>` : ''}
                    <span><i class="fas fa-user"></i> ${item.assigned_to_username || 'Sin asignar'}</span>
                </div>
            `;
            actions = `
                <button class="search-action-btn" onclick="navigateToTask(${item.task_id})" title="Ver tarea">
                    <i class="fas fa-eye"></i>
                </button>
            `;
            break;
            
        case 'project':
            const createdDate = new Date(item.created_at).toLocaleDateString('es-ES');
            content = `
                <div class="search-item-header">
                    <h5 class="search-item-title">${item.project_name}</h5>
                    <span class="search-item-status status-${item.status || 'pendiente'}">${item.status || 'Pendiente'}</span>
                </div>
                <p class="search-item-description">${item.description || 'Sin descripción'}</p>
                <div class="search-item-meta">
                    <span><i class="fas fa-calendar"></i> Creado: ${createdDate}</span>
                    <span><i class="fas fa-tasks"></i> ${item.task_count || 0} tareas</span>
                    ${item.created_by_username ? `<span><i class="fas fa-user"></i> ${item.created_by_username}</span>` : ''}
                </div>
            `;
            actions = `
                <button class="search-action-btn" onclick="navigateToProject(${item.project_id})" title="Ver proyecto">
                    <i class="fas fa-eye"></i>
                </button>
            `;
            break;
            
        case 'note':
            const noteDate = new Date(item.updated_at || item.created_at).toLocaleDateString('es-ES');
            const truncatedContent = item.content.length > 100 ? item.content.substring(0, 100) + '...' : item.content;
            content = `
                <div class="search-item-header">
                    <h5 class="search-item-title">Nota</h5>
                    ${item.is_pinned ? '<i class="fas fa-thumbtack search-pinned-icon" title="Nota anclada"></i>' : ''}
                </div>
                <p class="search-item-description">${truncatedContent}</p>
                <div class="search-item-meta">
                    <span><i class="fas fa-calendar"></i> ${noteDate}</span>
                </div>
            `;
            actions = `
                <button class="search-action-btn" onclick="navigateToNote(${item.note_id})" title="Ver nota">
                    <i class="fas fa-eye"></i>
                </button>
            `;
            break;
    }
    
    resultItem.innerHTML = `
        <div class="search-item-content">
            ${content}
        </div>
        <div class="search-item-actions">
            ${actions}
        </div>
    `;
    
    return resultItem;
}

/**
 * Navega a la sección de tareas y resalta una tarea específica.
 * @param {number} taskId - ID de la tarea.
 */
function navigateToTask(taskId) {
    // Cerrar modal de búsqueda
    const searchModal = document.getElementById('searchResultsModal');
    if (searchModal) {
        searchModal.classList.remove('show');
        isSearchActive = false;
    }
    
    // Navegar a la sección de tareas
    const taskMenuItem = document.querySelector('.menu-item[data-section="mis-tareas"]');
    if (taskMenuItem) {
        taskMenuItem.click();
        
        // Esperar un momento para que se cargue la sección y luego resaltar la tarea
        setTimeout(() => {
            const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
            if (taskElement) {
                taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                taskElement.classList.add('highlighted');
                setTimeout(() => taskElement.classList.remove('highlighted'), 3000);
            }
        }, 500);
    }
}

/**
 * Navega a la sección de proyectos y resalta un proyecto específico.
 * @param {number} projectId - ID del proyecto.
 */
function navigateToProject(projectId) {
    // Cerrar modal de búsqueda
    const searchModal = document.getElementById('searchResultsModal');
    if (searchModal) {
        searchModal.classList.remove('show');
        isSearchActive = false;
    }
    
    // Navegar a la sección de proyectos
    const projectMenuItem = document.querySelector('.menu-item[data-section="proyectos"]');
    if (projectMenuItem) {
        projectMenuItem.click();
        
        // Esperar un momento para que se cargue la sección y luego resaltar el proyecto
        setTimeout(() => {
            const projectElement = document.querySelector(`[data-project-id="${projectId}"]`);
            if (projectElement) {
                projectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                projectElement.classList.add('highlighted');
                setTimeout(() => projectElement.classList.remove('highlighted'), 3000);
            }
        }, 500);
    }
}

/**
 * Navega a la sección de notas y resalta una nota específica.
 * @param {number} noteId - ID de la nota.
 */
function navigateToNote(noteId) {
    // Cerrar modal de búsqueda
    const searchModal = document.getElementById('searchResultsModal');
    if (searchModal) {
        searchModal.classList.remove('show');
        isSearchActive = false;
    }
    
    // Navegar a la sección de notas
    const noteMenuItem = document.querySelector('.menu-item[data-section="notas"]');
    if (noteMenuItem) {
        noteMenuItem.click();
        
        // Esperar un momento para que se cargue la sección y luego resaltar la nota
        setTimeout(() => {
            const noteElement = document.querySelector(`[data-note-id="${noteId}"]`);
            if (noteElement) {
                noteElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                noteElement.classList.add('highlighted');
                setTimeout(() => noteElement.classList.remove('highlighted'), 3000);
            }
        }, 500);
    }
}

/**
 * Maneja la entrada de texto en el campo de búsqueda con debounce.
 * @param {string} searchTerm - Término de búsqueda.
 */
function handleSearchInput(searchTerm) {
    // Limpiar timeout anterior
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Si el término está vacío, no hacer nada
    if (!searchTerm || searchTerm.length < 2) {
        return;
    }
    
    // Configurar nuevo timeout para debounce
    searchTimeout = setTimeout(async () => {
        const results = await performGlobalSearch(searchTerm);
        if (results) {
            searchResults = results;
            renderSearchResults(results);
        }
    }, 300); // 300ms de debounce
}


/**
 * Carga y muestra la actividad reciente del usuario.
 */
async function loadRecentActivity() {
    const activityList = document.getElementById('recent-activity-list');
    if (!activityList) return;

    activityList.innerHTML = '<li class="loading-activity">Cargando actividad...</li>';

    try {
        const response = await fetch('/api/activity/recent');
        if (!response.ok) {
            throw new Error('No se pudo cargar la actividad reciente');
        }
        const activities = await response.json();

        activityList.innerHTML = ''; // Limpiar mensaje de carga

        if (activities.length === 0) {
            activityList.innerHTML = `
                <li class="empty-activity">
                    <i class="fas fa-wind"></i>
                    <span>No hay actividad reciente. ¡Ponte a trabajar!</span>
                </li>`;
            return;
        }

        activities.forEach(activity => {
            let iconClass = '';
            let description = '';
            let contextHTML = ''; // Variable para el contexto (ej. nombre del proyecto)

            switch (activity.activity_type) {
                case 'task_completed':
                    iconClass = 'fas fa-check-double activity-icon completed';
                    description = `<b>${activity.actor_username}</b> completó la tarea "<i>${activity.primary_subject}</i>"`;
                    if (activity.secondary_subject) {
                        contextHTML = `<div class="activity-context"><i class="fas fa-folder-open"></i><span>En el proyecto: <b>${activity.secondary_subject}</b></span></div>`;
                    }
                    break;
                case 'task_created':
                    iconClass = 'fas fa-plus-circle activity-icon created';
                    description = `<b>${activity.actor_username}</b> creó la tarea "<i>${activity.primary_subject}</i>"`;
                     if (activity.secondary_subject) {
                        contextHTML = `<div class="activity-context"><i class="fas fa-folder-open"></i><span>Para el proyecto: <b>${activity.secondary_subject}</b></span></div>`;
                    }
                    break;
                case 'project_created':
                    iconClass = 'fas fa-folder-plus activity-icon project';
                    description = `<b>${activity.actor_username}</b> creó el proyecto "<i>${activity.primary_subject}</i>"`;
                    break;
                default:
                    iconClass = 'fas fa-bell activity-icon';
                    description = `Actividad desconocida: ${activity.primary_subject}`;
            }

            const timeAgo = formatTimeAgo(activity.timestamp);

            const li = document.createElement('li');
            li.className = 'activity-item'; // Clase para el contenedor principal del item
            li.innerHTML = `
                <div class="activity-icon-wrapper">
                    <i class="${iconClass}" aria-hidden="true"></i>
                </div>
                <div class="activity-content">
                    <p class="activity-text">${description}</p>
                    ${contextHTML}
                    <span class="activity-timestamp">${timeAgo}</span>
                </div>
            `;
            activityList.appendChild(li);
        });

    } catch (error) {
        console.error('Error al cargar actividad reciente:', error);
        activityList.innerHTML = '<li class="error-activity">No se pudo cargar la actividad.</li>';
    }
}

/**
 * Convierte una cadena de semana (ej. "2023-W42") en un rango de fechas.
 * @param {string} weekString - La cadena de la semana.
 * @returns {{startDate: string, endDate: string}} Un objeto con las fechas de inicio y fin en formato YYYY-MM-DD.
 */
function getWeekDateRange(weekString) {
    const [year, week] = weekString.split('-W').map(Number);
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    const ISOweekEnd = new Date(ISOweekStart);
    ISOweekEnd.setDate(ISOweekStart.getDate() + 6);

    return { startDate: ISOweekStart.toISOString().split('T')[0], endDate: ISOweekEnd.toISOString().split('T')[0] };
}

/**
 * Carga Chart.js si no está disponible y luego renderiza los gráficos.
 * @param {string|null} [startDate=null] - La fecha de inicio para el filtro (YYYY-MM-DD).
 * @param {string|null} [endDate=null] - La fecha de fin para el filtro (YYYY-MM-DD).
 */
function loadChartJsAndRenderAnalytics(startDate = null, endDate = null) {
    if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        // Envolvemos la llamada en una función para poder pasar los parámetros
        script.onload = () => renderAnalyticsCharts(startDate, endDate);
        document.head.appendChild(script);
    } else {
        // Si ya está cargado, simplemente llamamos a la función con los parámetros
        renderAnalyticsCharts(startDate, endDate);
    }
}

/**
 * Renderiza los gráficos de analíticas y actualiza las tarjetas KPI.
 */
async function renderAnalyticsCharts(startDate = null, endDate = null) {
    let projects = [];
    let tasks = [];
    let queryParams = '';
    if (startDate && endDate) {
        queryParams = `?start_date=${startDate}&end_date=${endDate}`;
    }

    try {
        const [projectsResp, tasksResp] = await Promise.all([
            fetch(`/projects${queryParams}`),
            fetch(`/tasks${queryParams}`)
        ]);
        if (projectsResp.ok) projects = await projectsResp.json();
        if (tasksResp.ok) tasks = await tasksResp.json();
    } catch (e) {
        console.error("Error fetching initial data for analytics:", e);
        // Si falla, usar datos vacíos
        projects = [];
        tasks = [];
    }

    // --- ACTUALIZAR TARJETA DE TAREAS TOTALES EN EL DASHBOARD ---
    const totalTasksCard = document.querySelector('.dashboard-grid .total-tasks .card-value');
    if (totalTasksCard) {
        totalTasksCard.textContent = tasks.length;
    }

    // --- ACTUALIZAR TARJETA DE TAREAS COMPLETADAS HOY ---
    const completedTodayCard = document.querySelector('.dashboard-grid .completed-tasks .card-value');
    if (completedTodayCard) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Establecer al inicio del día para una comparación precisa

        const completedTodayCount = tasks.filter(task => {
            // La tarea debe estar completada y tener una fecha de completitud
            if (task.status !== 'completada' || !task.completed_at) {
                return false;
            }
            const completedDate = new Date(task.completed_at);
            completedDate.setHours(0, 0, 0, 0); // Normalizar la fecha de la tarea también

            return completedDate.getTime() === today.getTime();
        }).length;

        completedTodayCard.textContent = completedTodayCount;
    }

    // --- ACTUALIZAR TARJETA DE PENDIENTES PARA HOY ---
    const pendingTodayCard = document.querySelector('.dashboard-grid .pending-tasks .card-value');
    if (pendingTodayCard) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalizar la fecha de hoy al inicio del día

        const pendingTodayCount = tasks.filter(task => {
            // La tarea no debe estar completada
            if (task.status === 'completada') {
                return false;
            }
            // La tarea debe tener una fecha de vencimiento
            if (!task.due_date) {
                return false;
            }

            const dueDate = new Date(task.due_date);
            // Ajustar por la zona horaria para evitar que la fecha cambie al ser interpretada por JS
            const timezoneOffset = dueDate.getTimezoneOffset() * 60000;
            const localDueDate = new Date(dueDate.getTime() + timezoneOffset);
            localDueDate.setHours(0, 0, 0, 0); // Normalizar la fecha de vencimiento

            return localDueDate.getTime() === today.getTime();
        }).length;

        pendingTodayCard.textContent = pendingTodayCount;
    }

    // --- ACTUALIZAR TARJETA DE PRÓXIMOS VENCIMIENTOS (Tareas pendientes hoy) ---
    const upcomingCard = document.querySelector('.dashboard-grid .upcoming-deadlines .card-value');
    if (upcomingCard) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalizar la fecha de hoy al inicio del día

        const dueTodayCount = tasks.filter(task => {
            // La tarea debe tener una fecha de vencimiento y estar en estado 'pendiente'
            if (!task.due_date) {
                return false;
            }
            if (task.status !== 'pendiente') {
                return false;
            }

            const dueDate = new Date(task.due_date);
            // Ajustar por la zona horaria para evitar que la fecha cambie al ser interpretada por JS
            const timezoneOffset = dueDate.getTimezoneOffset() * 60000;
            const localDueDate = new Date(dueDate.getTime() + timezoneOffset);
            localDueDate.setHours(0, 0, 0, 0); // Normalizar la fecha de vencimiento

            // Contar solo las tareas que vencen hoy y están en estado 'pendiente'
            return localDueDate.getTime() === today.getTime();
        }).length;

        upcomingCard.textContent = dueTodayCount;
    }

    // --- Gráfico de dona: Progreso General de Tareas ---
    const tasksProgressCanvas = document.getElementById('tasksProgressCanvas');
    const progressSummary = document.querySelector('#tasks-progress-chart ~ .chart-summary');
    if (tasksProgressCanvas && window.Chart) {
        // Filtrar tareas solo para el usuario autenticado
        const userId = window.user_id ? String(window.user_id) : null;
        const userTasks = tasks.filter(t => String(t.assigned_to) === userId);

        // Calcular el porcentaje global de tareas completadas del usuario
        const totalTareas = userTasks.length;
        const totalCompletadas = userTasks.filter(t => t.status === 'completada').length;
        const totalPendientes = totalTareas - totalCompletadas;
        const porcentaje = totalTareas > 0 ? Math.round((totalCompletadas / totalTareas) * 100) : 0;

        if (progressSummary) {
            progressSummary.innerHTML = `<i class="fas fa-trophy" style="color:#FFD700;"></i> Has completado el <span class="highlight">${porcentaje}%</span> de tus tareas asignadas.`;
        }

        // Destruir gráfico existente si lo hay para evitar superposiciones
        if (tasksProgressCanvas.chart) {
            tasksProgressCanvas.chart.destroy();
        }

        tasksProgressCanvas.chart = new Chart(tasksProgressCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Completadas', 'Pendientes'],
                datasets: [
                    {
                        label: 'Estado de Tareas',
                        data: [totalCompletadas, totalPendientes],
                        backgroundColor: [
                            '#4F8EF7', // Azul para completadas
                            '#FFD700'  // Amarillo para pendientes
                        ],
                        borderColor: '#fff',
                        borderWidth: 3,
                        hoverOffset: 4
                    }
                ]
            },
            options: {
                responsive: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    title: { display: false }
                }
            }
        });
    }

    // --- Gráfico de pastel: Distribución de Proyectos por Usuario ---
    const projectsDistributionCanvas = document.getElementById('projectsDistributionCanvas');
    const distributionContainer = document.getElementById('distribution-summary-container');
    if (projectsDistributionCanvas && window.Chart) {
        try {
            const response = await fetch('/api/analytics/project_assignments');
            if (!response.ok) throw new Error('No se pudo cargar la distribución de proyectos');

            const distributionData = await response.json();

            if (distributionData.length > 0) {
                const labels = distributionData.map(item => item.username);
                const data = distributionData.map(item => item.project_count);

                // Crear un resumen más detallado y una lista
                const topUser = distributionData[0];
                const userListHtml = distributionData
                    .slice(0, 5) // Mostrar los 5 usuarios con más proyectos
                    .map(user => `
                        <li class="dist-list-item">
                            <span class="dist-user">${user.username}</span>
                            <span class="dist-count">${user.project_count} ${user.project_count > 1 ? 'proyectos' : 'proyecto'}</span>
                        </li>
                    `).join('');

                if (distributionContainer) {
                    distributionContainer.innerHTML = `
                        <p class="summary-highlight">
                            <i class="fas fa-user-tie" style="color:#4F8EF7;"></i>
                            <b>${topUser.username}</b> lidera la carga con <span class="highlight">${topUser.project_count}</span> proyectos.
                        </p>
                        <h4 class="dist-list-title">Carga de trabajo por usuario:</h4>
                        <ul class="distribution-list">${userListHtml}</ul>
                    `;
                }

                // Destruir gráfico existente si lo hay
                if (projectsDistributionCanvas.chart) {
                    projectsDistributionCanvas.chart.destroy();
                }

                projectsDistributionCanvas.chart = new Chart(projectsDistributionCanvas.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Proyectos por Usuario',
                            data: data,
                            backgroundColor: ['#4F8EF7', '#FFD700', '#FF6384', '#36A2EB', '#4BC0C0', '#9966FF', '#FF9F40'],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: false,
                        cutout: '65%',
                        plugins: {
                            legend: { display: true, position: 'bottom' },
                            title: { display: false }
                        }
                    }
                });
            } else {
                // Mostrar un mensaje si no hay datos
                if (distributionContainer) distributionContainer.innerHTML = '<p>No hay proyectos asignados para mostrar.</p>';
            }
        } catch (error) {
            console.error('Error al renderizar gráfico de distribución:', error);
            if (distributionContainer) distributionContainer.innerHTML = '<p>Error al cargar los datos del gráfico.</p>';
        }
    }

    // --- Carga de KPIs (Indicadores Clave de Rendimiento) ---
    try {
        const response = await fetch(`/api/analytics/summary${queryParams}`);
        if (!response.ok) {
            throw new Error('No se pudo cargar el resumen de analíticas');
        }
        const summaryData = await response.json();
        const {
            completedThisWeek,
            productivityChange,
            focusMinutesThisWeek,
            collaborativeProjectsCount
        } = summaryData;

        // Formatear el tiempo de enfoque para mejor legibilidad
        let focusTimeText = `${focusMinutesThisWeek}m`;
        if (focusMinutesThisWeek >= 60) {
            const hours = Math.floor(focusMinutesThisWeek / 60);
            const minutes = focusMinutesThisWeek % 60;
            focusTimeText = `${hours}h ${minutes}m`;
        }

        // Formatear productividad
        const productivityText = productivityChange >= 0 ? `+${productivityChange}%` : `${productivityChange}%`;
        const productivityCard = document.getElementById('kpi-productivity');
        if (productivityChange < 0) {
            productivityCard.querySelector('.kpi-value').style.color = 'var(--danger-color)';
        }

        // Poblar las tarjetas KPI
        document.querySelector('#kpi-completed-tasks .kpi-value').textContent = completedThisWeek;
        document.querySelector('#kpi-focus-time .kpi-value').textContent = focusTimeText;
        document.querySelector('#kpi-collab-projects .kpi-value').textContent = collaborativeProjectsCount;
        document.querySelector('#kpi-productivity .kpi-value').textContent = productivityText;
    } catch (error) {
        console.error('Error al cargar KPIs:', error);
        // Opcional: mostrar un error en las tarjetas KPI
    }
}

/**
 * Carga todos los proyectos existentes desde la API y los muestra en la página,
 * aplicando filtros y ordenamiento.
 */
async function loadAndRenderProjects() {
    const projectGridContainer = document.getElementById('project-grid');
    if (!projectGridContainer) return;
    try {
        const response = await fetch('/projects');
        if (!response.ok) throw new Error('Error al cargar proyectos');
        allProjects = await response.json(); // Guardar todos los proyectos en memoria

        renderProjectListWithFilter(); // Renderizar la lista inicial aplicando filtros y orden por defecto
    } catch (error) {
        console.error('Error al cargar los proyectos:', error);
        projectGridContainer.innerHTML = '<p class="error-message">No se pudieron cargar los proyectos.</p>';
    }
}

/**
 * Renderiza la lista de proyectos aplicando filtros y la vista actual (cuadrícula/lista).
 */
function renderProjectListWithFilter() {
    const projectGridContainer = document.getElementById('project-grid');
    const projectStatusFilter = document.getElementById('project-status-filter');
    if (!projectGridContainer) return;

    let filtered = allProjects;
    const filterValue = projectStatusFilter ? projectStatusFilter.value.trim() : 'all';

    if (filterValue && filterValue !== 'all') {
        filtered = allProjects.filter(p => (p.status || '').trim() === filterValue);
    }

    // Limpiar contenedor y clases de vista
    projectGridContainer.classList.remove('project-list-view');
    projectGridContainer.innerHTML = '';
    if (filtered.length === 0) {
        projectGridContainer.innerHTML = `
            <div class="empty-state" style="display: flex;">
                <i class="fas fa-folder-open" aria-hidden="true"></i>
                <p>No hay proyectos para este estado.</p>
            </div>`;
    } else {
        if (projectView === 'list') {
            projectGridContainer.classList.add('project-list-view');
            // Render tabla
            const tableHTML = `
                <table class="project-list-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Descripción</th>
                            <th>Creado</th>
                            <th>Estado</th>
                            <th>Tareas</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>`;
            projectGridContainer.innerHTML = tableHTML;
            filtered.forEach(project => addProjectToDOM(project, 'list'));
        } else {
            // La vista de cuadrícula es el estado por defecto, no necesita una clase extra.
            filtered.forEach(project => addProjectToDOM(project, 'grid'));
        }
    }
}

/**
 * Crea el HTML para un solo proyecto y lo añade al DOM.
 * @param {object} project - El objeto del proyecto con sus datos.
 * @param {string} view - La vista actual ('grid' o 'list').
 */
function addProjectToDOM(project, view = 'grid') {
    const projectGridContainer = document.getElementById('project-grid');
    if (!projectGridContainer) return;

    const emptyState = projectGridContainer.querySelector('.empty-state');
    if (emptyState) emptyState.style.display = 'none';

    // Usar project.title si existe, si no project.project_name (compatibilidad)
    const projectTitle = project.title || project.project_name || 'Sin título';

    // Opciones de estado
    const statusOptions = [
        { value: 'pendiente', label: 'Pendiente' },
        { value: 'en progreso', label: 'En Progreso' },
        { value: 'completada', label: 'Completada' },
        { value: 'cancelada', label: 'Cancelada' }
    ];
    let statusSelectHTML = `<select class="project-status-select" data-project-id="${project.project_id}">`;
    statusOptions.forEach(opt => {
        if ((project.status || '').trim() === opt.value) {
            statusSelectHTML += `<option value="${opt.value}" selected>${opt.label}</option>`;
        } else {
            statusSelectHTML += `<option value="${opt.value}">${opt.label}</option>`;
        }
    });
    statusSelectHTML += `</select>`;

    // Ocultar acciones si el rol es 'Invitado'
    let actionButtonsHTML = '';
    if (window.user_role !== 'Invitado') {
        actionButtonsHTML = `
            <button class="project-edit-btn" aria-label="Editar proyecto"><i class="fas fa-edit"></i> Editar</button>
            <button class="project-delete-btn" aria-label="Eliminar proyecto"><i class="fas fa-trash-alt"></i> Eliminar</button>
        `;
    }


    if (view === 'list') {
        // Render como fila de tabla
        const projectRow = `
            <tr data-project-id="${project.project_id}">
                <td>${projectTitle}</td>
                <td>${project.description || 'Sin descripción.'}</td>
                <td>${project.created_at ? new Date(project.created_at).toLocaleDateString('es-ES') : 'Sin fecha'}</td>
                <td>${statusSelectHTML}</td>
                <td>${project.task_count || 0}</td>
                <td>
                    <button class="project-details-btn" aria-label="Ver detalles del proyecto">Ver Detalles <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
                    ${actionButtonsHTML}
                </td>
            </tr>
        `;
        projectGridContainer.querySelector('tbody').insertAdjacentHTML('beforeend', projectRow);
    } else {
        // Render como tarjeta (cuadrícula)
        const projectHTML = `
            <div class="card project-card" data-project-id="${project.project_id}">
                <div class="project-header">
                    <h4 class="project-title">${projectTitle}</h4>
                    ${statusSelectHTML}
                </div>
                <p class="project-description">${project.description || 'Sin descripción.'}</p>
                <div class="project-stats">
                    <span><i class="fas fa-tasks" aria-hidden="true"></i> ${project.task_count || 0} Tareas</span>
                    <span><i class="fas fa-calendar-alt" aria-hidden="true"></i> Creado: ${project.created_at ? new Date(project.created_at).toLocaleDateString('es-ES') : 'Sin fecha'}</span>
                </div>
                <div class="project-team">
                    <!-- Lógica para avatares de equipo se puede añadir después -->
                </div>
                <div class="project-actions">
                    <button class="project-details-btn" aria-label="Ver detalles del proyecto">Ver Detalles <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
                    ${actionButtonsHTML}
                </div>
            </div>
        `;
        projectGridContainer.insertAdjacentHTML('beforeend', projectHTML);
    }

    // Aplicar color al selector recién creado
    // Usamos setTimeout para asegurar que el elemento esté en el DOM antes de intentar colorearlo
    setTimeout(() => {
        const newSelect = projectGridContainer.querySelector(`.project-status-select[data-project-id="${project.project_id}"]`);
        if (newSelect) {
            colorizeProjectStatusSelect(newSelect);
        }
    }, 0);
}

/**
 * Rellena los selectores <select> de los modales (proyectos y usuarios).
 */
async function populateDropdowns() {
    const projectSelect = document.getElementById('addTaskProject');
    const userSelect = document.getElementById('addTaskAssignedTo');

    // Limpiar opciones previas para evitar duplicados al recargar
    if (!projectSelect || !userSelect) return;

    projectSelect.innerHTML = '<option value="">Selecciona un proyecto</option>';
    userSelect.innerHTML = '<option value="">Selecciona un usuario</option>';

    try {
        // Cargar Proyectos
        const projectsResponse = await fetch('/projects');
        const projects = await projectsResponse.json();
        projects.forEach(project => {
            const option = new Option(project.project_name, project.project_id);
            projectSelect.add(option.cloneNode(true));
        });

        // Cargar Usuarios
        const usersResponse = await fetch('/users');
        const users = await usersResponse.json();
        users.forEach(user => {
            const option = new Option(`${user.first_name} ${user.last_name} (@${user.username})`, user.user_id);
            userSelect.add(option.cloneNode(true));
        });
    } catch (error) {
        console.error('Error al poblar los dropdowns:', error);
    }
}

// --- FUNCIONES GLOBALES PARA OBJETIVOS (Accedidas desde el HTML con onclick) ---
window.toggleObjective = async function(id) {
    const objective = focusObjectives.find(obj => obj.objective_id === id);
    if (objective) {
        try {
            const resp = await fetch(`/focus_objectives/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: !objective.completed })
            });
            if (!resp.ok) throw new Error('No se pudo actualizar el objetivo');
            objective.completed = !objective.completed; // Actualizar estado local
            renderFocusObjectives(); // Re-renderizar la UI
        } catch (e) {
            await showAlert('Error', 'No se pudo marcar como completado: ' + e.message);
        }
    }
};

window.removeObjective = async function(id) {
    const confirmed = await showConfirm('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar este objetivo?');
    if (confirmed) {
        try {
            await fetch(`/focus_objectives/${id}`, { method: 'DELETE' });
            focusObjectives = focusObjectives.filter(obj => obj.objective_id !== id);
            renderFocusObjectives();
            await showAlert('Eliminado', 'Objetivo eliminado exitosamente.');
        } catch (e) {
            await showAlert('Error', 'No se pudo eliminar el objetivo: ' + e.message);
        }
    }
};


/**
 * Verifica si hay una sesión de enfoque activa al cargar la página de enfoque
 * y permite al usuario descartarla si lo desea.
 */
async function checkAndHandleActiveFocusSession() {
    try {
        const response = await fetch('/api/focus/active_session');
        // Si el servidor devuelve un error (ej. 401, 500), no molestamos al usuario.
        // Simplemente lo registramos en la consola y continuamos.
        if (!response.ok) {
            console.error('No se pudo verificar el estado de la sesión de enfoque.');
            return;
        }

        const activeSession = await response.json();

        // El endpoint devuelve `null` si no hay sesión activa.
        // Si devuelve un objeto, significa que hay una sesión colgada.
        if (activeSession && activeSession.session_id) {
            const sessionStartTime = new Date(activeSession.start_time);
            const timeAgo = formatTimeAgo(sessionStartTime);

            const confirmed = await showConfirm(
                'Sesión Activa Encontrada',
                `Hemos encontrado una sesión de enfoque sin terminar que comenzó ${timeAgo}. ¿Deseas descartarla para poder empezar una nueva?`
            );

            if (confirmed) {
                // El usuario quiere descartar la sesión vieja.
                const discardResponse = await fetch('/api/focus/discard_session', {
                    method: 'POST'
                });

                if (discardResponse.ok) {
                    await showAlert('Sesión Descartada', 'La sesión anterior ha sido descartada. Ahora puedes iniciar una nueva.');
                } else {
                    const errorData = await discardResponse.json();
                    throw new Error(errorData.error || 'No se pudo descartar la sesión.');
                }
            }
        }
    } catch (error) {
        console.error('Error manejando sesión de enfoque activa:', error);
        await showAlert('Error de Sesión', `Ocurrió un error al verificar sesiones activas: ${error.message}`);
    }
}

/**
 * Initializes all the main event listeners for the application.
 */
function initializeEventListeners() {
    // This function will contain the logic currently inside DOMContentLoaded
    // For brevity, I'm not moving all the code here in this diff,
    // but you would move all the .addEventListener calls and related logic
    // into this new function.
}

// --- LÓGICA PRINCIPAL DE LA APLICACIÓN (EJECUTADA AL CARGAR EL DOM) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- FUNCIONALIDAD: Selector de Rango de Fechas para Analíticas ---
    const dateRangeBtn = document.getElementById('date-range-btn');
    if (dateRangeBtn) {
        dateRangeBtn.addEventListener('click', () => {
            // Crear y configurar el modal de rango de fechas
            let modal = document.getElementById('dateRangeModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'dateRangeModal';
                modal.className = 'modal';
                modal.innerHTML = `
                    <div class="modal-content date-range-modal-content">
                        <span class="close-button" id="closeDateRangeModal">&times;</span>
                        <h3><i class="fas fa-calendar-week"></i> Seleccionar Periodo</h3>
                        <p>Elige una semana para filtrar las analíticas. Por defecto, se muestran los últimos 7 días.</p>
                        <form id="dateRangeForm">
                            <div class="form-group">
                                <label for="weekSelector">Selecciona una semana:</label>
                                <input type="week" id="weekSelector" required />
                            </div>
                            <div class="modal-actions date-range-actions">
                                <button type="button" id="revertToCurrentWeekBtn" class="btn secondary-btn">
                                    <i class="fas fa-sync-alt"></i> Datos por Defecto
                                </button>
                                <button type="submit" class="btn primary-btn">
                                    <i class="fas fa-check"></i> Aplicar Selección
                                </button>
                            </div>
                        </form>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            // Mostrar modal
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';

            // Función para cerrar el modal
            const closeModalHandler = () => {
                modal.classList.remove('show');
                document.body.style.overflow = '';
            };

            // Asignar listeners
            modal.querySelector('#closeDateRangeModal').onclick = closeModalHandler;
            modal.onclick = (e) => { if (e.target === modal) closeModalHandler(); };

            // Listener para el botón de revertir
            modal.querySelector('#revertToCurrentWeekBtn').onclick = () => {
                const dateRangeLabel = document.getElementById('date-range-label');
                if (dateRangeLabel) dateRangeLabel.textContent = 'Rango de Fechas';
                loadChartJsAndRenderAnalytics(null, null); // Cargar datos por defecto
                closeModalHandler();
            };

            // Listener para el envío del formulario
            modal.querySelector('#dateRangeForm').onsubmit = (e) => {
                e.preventDefault();
                const week = modal.querySelector('#weekSelector').value;
                const dateRangeLabel = document.getElementById('date-range-label');
                if (week) {
                    const { startDate, endDate } = getWeekDateRange(week);
                    const formattedStart = new Date(startDate + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                    const formattedEnd = new Date(endDate + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                    if (dateRangeLabel) dateRangeLabel.textContent = `${formattedStart} - ${formattedEnd}`;
                    loadChartJsAndRenderAnalytics(startDate, endDate);
                    closeModalHandler();
                } else {
                    showAlert('Selección inválida', 'Por favor selecciona una semana válida.');
                }
            };
        });
    }
    // --- INTEGRACIÓN DE CHART.JS PARA ANALÍTICAS ---
    loadChartJsAndRenderAnalytics();

    // --- Lógica para Exportar Datos ---
    const exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', async () => {
            const originalHTML = exportDataBtn.innerHTML;
            exportDataBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando...';
            exportDataBtn.disabled = true;

            try {
                const response = await fetch('/api/export/csv');

                if (!response.ok) {
                    if (response.status === 404) {
                        await showAlert('Sin Datos', 'No hay datos disponibles para exportar.');
                    } else {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'No se pudo generar el archivo de exportación.');
                    }
                    return; // Detener la ejecución si hay un error o no hay datos
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                
                const date = new Date().toISOString().slice(0, 10);
                a.download = `taskmanager_pro_export_${date}.csv`;
                
                document.body.appendChild(a);
                a.click();
                
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } catch (error) {
                await showAlert('Error de Exportación', `Ocurrió un error: ${error.message}`);
            } finally {
                exportDataBtn.innerHTML = originalHTML;
                exportDataBtn.disabled = false;
            }
        });
    }

    // --- LÓGICA DE ACTIVIDAD RECIENTE ---
    loadRecentActivity();

    // --- Sección de Navegación y Vistas ---
    // Selecciona todos los elementos del menú y las secciones de contenido
    const menuItems = document.querySelectorAll('.sidebar .menu-item');
    const sections = document.querySelectorAll('.content-section');

    /**
     * Cambia la vista a la sección especificada y carga los datos necesarios.
     * @param {string} sectionName - El nombre de la sección (ej. 'inicio', 'recursos').
     */
    function showSection(sectionName) {
        const targetSectionId = sectionName + '-section';

        sections.forEach(section => {
            if (section.id === targetSectionId) {
                section.classList.add('active-section');
            } else {
                section.classList.remove('active-section');
            }
        });

        menuItems.forEach(item => {
            if (item.getAttribute('data-section') === sectionName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Cargar datos específicos de la sección al cambiar
        if (sectionName === 'notas') {
            loadAllNotes(); // Carga todas las notas
        } else if (sectionName === 'colaboradores') {
            loadAndRenderCollaborators(); // Carga y renderiza colaboradores
        } else if (sectionName === 'recursos') {
            loadAllResources(); // Carga todos los recursos
        } else if (sectionName === 'analiticas') {
            renderAnalyticsCharts(); // Los gráficos pueden necesitar re-renderizarse si estaban ocultos
        } else if (sectionName === 'mis-tareas') { // FIX: El data-attribute es 'mis-tareas', no 'tareas'.
            loadAndRenderTasks(); // Carga y renderiza las tareas
        } else if (sectionName === 'proyectos') {
            loadAndRenderProjects(); // Carga y renderiza los proyectos
        } else if (sectionName === 'modo-enfoque') {
            // Al entrar en el modo enfoque, verificar si hay sesiones colgadas.
            checkAndHandleActiveFocusSession();
            // También es buena idea recargar las tareas para el selector y las estadísticas.
            loadTasksForFocus();
            loadFocusStats();
        } else if (sectionName === 'inicio') {
            loadAndRenderNotes(); // Carga las notas ancladas para el dashboard
            loadRecentActivity(); // Recarga la actividad reciente
            loadChartJsAndRenderAnalytics(); // Recarga los gráficos
        }
    }

    // Manejador de clics unificado para el menú lateral
    menuItems.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            const sectionName = item.getAttribute('data-section');
            showSection(sectionName);
        });
    });

    // Asegurarse de que la sección 'inicio' esté activa al cargar y sus datos se carguen
    showSection('inicio'); // Usar 'inicio' como nombre de sección para el showSection
    loadAndRenderNotes(); // Cargar las notas ancladas para el dashboard al inicio

    // --- Lógica para Modales ---
    const modalTriggers = document.querySelectorAll('[data-modal-target]');
    const allModals = document.querySelectorAll('.modal');
    const modalCloseButtons = document.querySelectorAll('.close-button');

    // Abrir modales usando el atributo data-modal-target
    modalTriggers.forEach(trigger => {
        trigger.addEventListener('click', async () => {
            const modalId = 'modal' + trigger.dataset.modalTarget.charAt(0).toUpperCase() + trigger.dataset.modalTarget.slice(1);

            // --- COMPROBACIÓN DE PERMISOS PARA GESTIONAR ROLES ---
            if (trigger.dataset.modalTarget === 'manageRoles' && window.user_role !== 'Administrador') {
                await showAlert('Acceso Denegado', 'No tienes los permisos necesarios para gestionar roles.');
                return;
            }

            openModal(modalId);
            // Si es el modal de añadir tarea, poblar dropdowns
            if (modalId === 'modalAddTask') {
                populateDropdowns();
            }
            // Si es el modal de gestionar roles, cargar los roles
            if (modalId === 'modalManageRoles') {
                loadAndRenderRoles();
            }
            // Si es el modal de añadir usuario, poblar el selector de roles
            if (modalId === 'modalAddUser') {
                populateRoleDropdown('addUserRole');
            }
            // Si es el modal de añadir recurso, poblar categorías (si aplica)
            // if (modalId === 'modalAddResource') { populateResourceCategories(); }
        });
    });

    // Cerrar modales con el botón de cerrar (la 'x')
    modalCloseButtons.forEach(button => {
        button.addEventListener('click', () => {
            closeModal(button.closest('.modal'));
        });
    });

    // Cerrar modales haciendo clic en el fondo oscuro
    allModals.forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                // Si se cierra el modal de tareas, resetearlo para que esté limpio la próxima vez
                if (modal.id === 'modalAddTask') {
                    resetTaskModal();
                }
                closeModal(modal);
            }
        });
    });

    // --- Lógica del Menú Desplegable "Nuevo" ---
    const addNewGlobalBtn = document.getElementById('addNewGlobalBtn');
    const newDropdownMenu = document.getElementById('new-dropdown-menu');
    if (addNewGlobalBtn) {
        addNewGlobalBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Evita que el clic se propague y cierre el menú
            newDropdownMenu.classList.toggle('show');
        });

        // Cierra el menú si se hace clic en cualquier otro lugar
        document.addEventListener('click', (event) => {
            if (!newDropdownMenu.contains(event.target) && !addNewGlobalBtn.contains(event.target)) {
                newDropdownMenu.classList.remove('show');
            }
        });

        // Cierra el menú cuando se selecciona una opción
        newDropdownMenu.addEventListener('click', () => {
            newDropdownMenu.classList.remove('show');
        });
    }

    // --- Selectores de contenedores de listas ---
    const taskListContainer = document.getElementById('task-list');
    const projectGridContainer = document.getElementById('project-grid');
    const importantNotesList = document.getElementById('important-notes-list');

    // --- Manejador de formulario UNIFICADO para añadir y editar Tarea ---
    const formAddTask = document.getElementById('formAddTask');
    const modalAddTask = document.getElementById('modalAddTask');
    if (formAddTask) {
        formAddTask.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(formAddTask);
            const taskData = Object.fromEntries(formData.entries());
            const editingTaskId = formAddTask.getAttribute('data-editing-task-id');

            let url = '/tasks';
            let method = 'POST';

            if (editingTaskId) {
                url = `/tasks/${editingTaskId}`;
                method = 'PUT';
            }

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(taskData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Error al ${editingTaskId ? 'actualizar' : 'crear'} la tarea`);
                }

                await loadAndRenderTasks(); // Recargar la lista para reflejar los cambios
                resetTaskModal();
                closeModal(modalAddTask);
                await showAlert('Tarea Guardada', `Tarea ${editingTaskId ? 'actualizada' : 'creada'} exitosamente.`);
                await loadChartJsAndRenderAnalytics(); // Recargar analíticas también
            } catch (error) {
                await showAlert('Error al guardar', `No se pudo guardar la tarea: ${error.message}`);
            }
        });
    }

    // --- Delegación de eventos para el checkbox de completar tarea ---
    if (taskListContainer) {
        taskListContainer.addEventListener('change', async (event) => {
            const checkbox = event.target.closest('.task-checkbox');
            if (!checkbox) return;

            const taskItem = checkbox.closest('.task-item');
            const taskId = taskItem.getAttribute('data-task-id');
            const newStatus = checkbox.checked ? 'completada' : 'pendiente';

            try {
                const response = await fetch(`/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Error al actualizar el estado.');
                }

                await loadAndRenderTasks(); // Recargar la lista de tareas para reflejar el cambio y la posible reordenación
                await loadChartJsAndRenderAnalytics(); // Recargar analíticas también
            } catch (error) {
                await showAlert('Error al actualizar', `No se pudo actualizar la tarea: ${error.message}`);
                checkbox.checked = !checkbox.checked; // Revertir en caso de error
            }
        });
    }

    // --- Delegación de eventos para los botones de eliminar y editar tarea ---
    if (taskListContainer) {
        taskListContainer.addEventListener('click', async (event) => {
            const taskItem = event.target.closest('.task-item');
            if (!taskItem) return;
            const taskId = taskItem.getAttribute('data-task-id');

            // Eliminar tarea
            if (event.target.closest('.delete-task-btn')) {
                const confirmed = await showConfirm('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar esta tarea?');
                if (confirmed) {
                    try {
                        const response = await fetch(`/tasks/${taskId}`, { method: 'DELETE' });
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Error al eliminar la tarea');
                        }
                        taskItem.remove();
                        // Si no quedan tareas, mostrar el estado vacío
                        if (taskListContainer.querySelectorAll('.task-item').length === 0) {
                            taskListContainer.innerHTML = `
                                <div class="empty-state" style="display: flex;">
                                    <i class="fas fa-tasks-alt" aria-hidden="true"></i>
                                    <p>Aún no hay tareas. ¡Empieza creando una nueva!</p>
                                </div>`;
                        }
                        await showAlert('Tarea Eliminada', 'La tarea ha sido eliminada exitosamente.');
                        await loadChartJsAndRenderAnalytics(); // Recargar analíticas
                    } catch (error) {
                        await showAlert('Error al eliminar', `No se pudo eliminar la tarea: ${error.message}`);
                    }
                }
            }

            // Editar tarea (usando el modal)
            if (event.target.closest('.edit-task-btn')) {
                try {
                    // Obtener datos completos y frescos de la tarea desde el backend
                    const response = await fetch(`/tasks/${taskId}`);
                    if (!response.ok) {
                        throw new Error('No se pudo obtener la información de la tarea del servidor.');
                    }
                    const task = await response.json();
                    // Abrir el modal principal con los datos de la tarea
                    openModalForEdit(task);
                } catch (error) {
                    await showAlert('Error de carga', 'No se pudo cargar la tarea para editar: ' + error.message);
                }
            }
        });
    }

    // --- MODAL DETALLES DE PROYECTO ---
    const modalProjectDetails = document.getElementById('modalProjectDetails');
    const projectDetailsBody = document.getElementById('projectDetailsBody');
    const projectDetailsTitle = document.getElementById('projectDetailsTitle');
    const closeProjectDetailsBtn = modalProjectDetails?.querySelector('.close-button'); // Usar optional chaining

    // Delegación de eventos para el botón "Ver Detalles" de cada proyecto
    if (projectGridContainer) {
        projectGridContainer.addEventListener('click', async (event) => {
            const detailsBtn = event.target.closest('.project-details-btn');
            if (!detailsBtn) return;

            const projectElement = detailsBtn.closest('[data-project-id]');
            if (!projectElement) return;
            const projectId = projectElement.getAttribute('data-project-id');

            let project = null;
            let tasks = [];

            try {
                const [projectResp, tasksResp] = await Promise.all([
                    fetch(`/projects/${projectId}`),
                    fetch('/tasks') // Obtener todas las tareas y luego filtrar
                ]);

                if (!projectResp.ok) throw new Error('No se pudo cargar el proyecto.');
                project = await projectResp.json();

                if (tasksResp.ok) {
                    const allUserTasks = await tasksResp.json();
                    tasks = allUserTasks.filter(t => String(t.project_id) === String(projectId));
                }

            } catch (e) {
                await showAlert('Error de carga', 'No se pudieron cargar los detalles del proyecto: ' + e.message);
                return;
            }

            // Renderizar detalles
            const statusOptions = [
                { value: 'pendiente', label: 'Pendiente' },
                { value: 'en progreso', label: 'En Progreso' },
                { value: 'completada', label: 'Completada' },
                { value: 'cancelada', label: 'Cancelada' }
            ];
            let html = `<strong>Nombre:</strong> ${project.title || project.project_name || 'Sin título'}<br>`;
            html += `<strong>Descripción:</strong> ${project.description || 'Sin descripción.'}<br>`;
            html += `<strong>Fecha de creación:</strong> ${project.created_at ? new Date(project.created_at).toLocaleDateString('es-ES') : 'Sin fecha'}<br>`;
            html += `<strong>Estado:</strong> <select id="projectStatusSelect">`;
            statusOptions.forEach(opt => {
                if ((project.status || '').trim() === opt.value) {
                    html += `<option value="${opt.value}" selected>${opt.label}</option>`;
                } else {
                    html += `<option value="${opt.value}">${opt.label}</option>`;
                }
            });
            html += `</select><br>`;
            html += `<strong>Tareas asignadas:</strong> ${tasks.length}<br><br>`;
            if (tasks.length > 0) {
                html += `<ul style="padding-left:18px;">`;
                tasks.forEach(task => {
                    let due = 'Sin fecha';
                    if (task.due_date) {
                        const d = new Date(task.due_date);
                        if (!isNaN(d.getTime())) due = d.toLocaleDateString('es-ES');
                    }
                    html += `<li><b>${task.task_title}</b> - <span>${task.status}</span> <span style="color:#888;">(Vence: ${due})</span></li>`;
                });
                html += `</ul>`;
            } else {
                html += `<em>Este proyecto no tiene tareas asignadas.</em>`;
            }
            if (projectDetailsBody) projectDetailsBody.innerHTML = html;
            if (modalProjectDetails) modalProjectDetails.classList.add('show');
            document.body.style.overflow = 'hidden';

            // Lógica para actualizar el estado del proyecto desde el modal de detalles
            const statusSelect = document.getElementById('projectStatusSelect');
            if (statusSelect) {
                statusSelect.addEventListener('change', async function() {
                    const newStatus = this.value;
                    try {
                        const resp = await fetch(`/projects/${projectId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: newStatus })
                        });
                        if (!resp.ok) {
                            const err = await resp.json();
                            await showAlert('Error al actualizar', 'No se pudo actualizar el estado: ' + (err.error || 'Error desconocido'));
                            this.value = project.status; // Revertir
                        } else {
                            project.status = newStatus; // Actualizar el objeto local
                            await showAlert('Estado Actualizado', 'Estado del proyecto actualizado correctamente.');
                            loadAndRenderProjects(); // Refrescar lista de proyectos
                        }
                    } catch (e) {
                        await showAlert('Error de red', 'Error de red al actualizar el estado.');
                        this.value = project.status;
                    }
                });
            }
        });
    }
    if (closeProjectDetailsBtn) {
        closeProjectDetailsBtn.addEventListener('click', () => {
            if (modalProjectDetails) modalProjectDetails.classList.remove('show');
            document.body.style.overflow = '';
        });
    }
    if (modalProjectDetails) {
        modalProjectDetails.addEventListener('click', (event) => {
            if (event.target === modalProjectDetails) {
                modalProjectDetails.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    }

    // --- Filtro de estado para proyectos ---
    const projectStatusFilter = document.getElementById('project-status-filter');
    const gridBtn = document.querySelector('.action-btn[aria-label="Cambiar a vista de cuadrícula"]');
    const listBtn = document.querySelector('.action-btn[aria-label="Cambiar a vista de lista"]');

    function setProjectView(view) {
        projectView = view;
        renderProjectListWithFilter();
    }

    if (gridBtn && listBtn) {
        gridBtn.addEventListener('click', () => setProjectView('grid'));
        listBtn.addEventListener('click', () => setProjectView('list'));
    }

    // Delegación para actualizar estado desde la tarjeta y para editar/eliminar proyecto
    if (projectGridContainer) {
        // Evento 'change' para el selector de estado del proyecto
        projectGridContainer.addEventListener('change', async (event) => {
            const select = event.target.closest('.project-status-select');
            if (!select) return;
            colorizeProjectStatusSelect(select); // Actualizar color al instante
            const projectId = select.getAttribute('data-project-id');
            const newStatus = select.value;
            try {
                const resp = await fetch(`/projects/${projectId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    await showAlert('Error al actualizar', 'No se pudo actualizar el estado: ' + (err.error || 'Error desconocido'));
                } else {
                    // No es necesario recargar todo, solo actualizar el objeto en memoria
                    const projectToUpdate = allProjects.find(p => String(p.project_id) === String(projectId));
                    if (projectToUpdate) projectToUpdate.status = newStatus;
                }
            } catch (e) {
                await showAlert('Error de red', 'Error de red al actualizar el estado del proyecto.');
            }
        });
        // Acciones de click (Editar y Eliminar)
        projectGridContainer.addEventListener('click', async (event) => {
            const editBtn = event.target.closest('.project-edit-btn');
            const deleteBtn = event.target.closest('.project-delete-btn');

            if (editBtn) {
                const projectElement = editBtn.closest('[data-project-id]');
                if (!projectElement) return;
                const projectId = projectElement.getAttribute('data-project-id');
                const project = allProjects.find(p => String(p.project_id) === String(projectId));
                if (!project) return;

                // Rellenar el modal de edición
                document.getElementById('editProjectId').value = project.project_id;
                document.getElementById('editProjectTitle').value = project.title || project.project_name || '';
                document.getElementById('editProjectDescription').value = project.description || '';
                openModal('modalEditProject');
                return;
            }

            if (deleteBtn) {
                const projectElement = deleteBtn.closest('[data-project-id]');
                if (!projectElement) return;
                const projectId = projectElement.getAttribute('data-project-id');

                // Diálogo de confirmación para evitar eliminaciones accidentales
                const confirmed = await showConfirm(
                    'Confirmar Eliminación',
                    '¿Estás seguro de que deseas eliminar este proyecto?\n\n¡ATENCIÓN! Se eliminarán también todas las tareas y datos asociados de forma permanente.'
                );

                if (confirmed) {
                    try {
                        const response = await fetch(`/projects/${projectId}`, {
                            method: 'DELETE'
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Error al eliminar el proyecto');
                        }

                        // Si tiene éxito, recargar la lista de proyectos para reflejar el cambio
                        await loadAndRenderProjects();
                        await showAlert('Proyecto Eliminado', 'El proyecto y sus tareas asociadas han sido eliminados exitosamente.');
                    } catch (error) {
                        await showAlert('Error al eliminar', `No se pudo eliminar el proyecto: ${error.message}`);
                    }
                }
            }
        });
    }

    // Lógica para cerrar el modal de edición de proyecto
    const modalEditProject = document.getElementById('modalEditProject');
    if (modalEditProject) {
        const closeBtn = modalEditProject.querySelector('.close-button');
        if (closeBtn) { // Asegurarse de que el botón exista
            closeBtn.addEventListener('click', () => {
                modalEditProject.classList.remove('show');
                document.body.style.overflow = '';
            });
        }
        modalEditProject.addEventListener('click', (event) => {
            if (event.target === modalEditProject) {
                modalEditProject.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    }

    // Lógica para guardar cambios de edición de proyecto
    const formEditProject = document.getElementById('formEditProject');
    if (formEditProject) {
        formEditProject.addEventListener('submit', async (e) => {
            e.preventDefault();
            const projectId = document.getElementById('editProjectId').value;
            const title = document.getElementById('editProjectTitle').value;
            const description = document.getElementById('editProjectDescription').value;
            try {
                const resp = await fetch(`/projects/${projectId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description })
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    await showAlert('Error al actualizar', 'No se pudo actualizar el proyecto: ' + (err.error || 'Error desconocido'));
                } else {
                    closeModal(modalEditProject);
                    await loadAndRenderProjects(); // Recargar proyectos para ver el cambio
                    await showAlert('Proyecto Actualizado', 'El proyecto ha sido actualizado exitosamente.');
                }
            } catch (e) {
                await showAlert('Error de red', 'Error de red al actualizar el proyecto.');
            }
        });
    }

    // --- Lógica para el modal de edición de perfil (Avatar) ---
    const modalEditProfile = document.getElementById('modalEditProfile');
    const formEditProfile = document.getElementById('formEditProfile');
    const avatarInput = document.getElementById('editProfileAvatar');
    const avatarPreview = document.getElementById('avatarPreview');

    if (avatarInput && avatarPreview) {
        // 1. Previsualización del avatar al seleccionarlo
        avatarInput.addEventListener('change', () => {
            const file = avatarInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarPreview.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (formEditProfile) {
        // 2. Envío del formulario para actualizar el avatar
        formEditProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(formEditProfile);
            const submitButton = formEditProfile.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.innerHTML;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            submitButton.disabled = true;

            try {
                // El endpoint correcto para subir solo el avatar es /api/user/avatar
                const response = await fetch('/api/user/avatar', {
                    method: 'POST',
                    body: formData // FormData se encarga de los headers para multipart/form-data
                });

                if (!response.ok) {
                    // Si la respuesta no es OK, puede ser HTML (ej. página de login si la sesión expiró),
                    // lo que causa el error "Unexpected token '<'". Leemos como texto para dar un mejor error.
                    const errorText = await response.text();
                    try {
                        // Intentamos parsear como JSON por si el servidor envió un error JSON válido
                        const errorData = JSON.parse(errorText);
                        throw new Error(errorData.error || 'Error al actualizar el perfil.');
                    } catch (e) {
                        // Si el parseo falla, es probable que sea HTML.
                        throw new Error('Respuesta inesperada del servidor. Es posible que la sesión haya expirado.');
                    }
                }

                const result = await response.json();

                // El backend devuelve { message: '...', avatar_url: '...' }
                // Actualizamos la UI con la nueva URL del avatar
                const topbarAvatar = document.getElementById('topbarUserAvatar');
                const modalAvatarPreview = document.getElementById('avatarPreview'); // También el del modal

                if (topbarAvatar && result.avatar_url) {
                    topbarAvatar.src = result.avatar_url;
                }
                if (modalAvatarPreview && result.avatar_url) {
                    modalAvatarPreview.src = result.avatar_url;
                }

                await showAlert('Éxito', result.message || 'Tu perfil ha sido actualizado.');
                closeModal(modalEditProfile);
            } catch (error) {
                await showAlert('Error', `No se pudo actualizar el perfil: ${error.message}`);
            } finally {
                submitButton.innerHTML = originalButtonText;
                submitButton.disabled = false;
            }
        });
    }

    // --- LÓGICA DE PERSONALIZACIÓN DE APARIENCIA ---
    const appearanceModal = document.getElementById('modalCustomizeAppearance');
    // Variables para guardar el estado previo y temporal
    let previousAppearanceState = null;
    let tempAppearanceState = null;

    // Función para obtener el estado actual de la apariencia
    function getCurrentAppearanceState() {
        const state = {};
        // Tema
        state.selectedTheme = localStorage.getItem('selectedTheme') || 'default';
        // Tipografía
        state.fontSize = localStorage.getItem('fontSize') || '';
        state.fontFamily = localStorage.getItem('fontFamily') || '';
        // Colores personalizados
        state.customColors = {};
        const colorKeys = [
            'custom-primary-color', 'custom-primary-dark-color', 'custom-secondary-color',
            'custom-accent-color', 'custom-accent-dark-color', 'custom-background-light-color',
            'custom-background-dark-color', 'custom-text-color', 'custom-text-light-color',
            'custom-border-color', 'custom-sidebar-bg-color', 'custom-sidebar-text-color',
            'custom-card-bg-color'
        ];
        colorKeys.forEach(key => {
            state.customColors[key] = localStorage.getItem(key) || '';
        });
        return state;
    }

    // Función para aplicar un estado de apariencia (sin guardar)
    function applyAppearanceState(state) {
        const root = document.documentElement;
        // Tema
        document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
        if (state.selectedTheme && state.selectedTheme !== 'default') {
            document.body.classList.add(`theme-${state.selectedTheme}`);
        }
        // Tipografía
        if (state.fontSize) root.style.setProperty('--base-font-size', state.fontSize);
        if (state.fontFamily) root.style.setProperty('--base-font-family', `'${state.fontFamily}', sans-serif`);
        // Colores personalizados
        Object.entries(state.customColors).forEach(([key, value]) => {
            if (value) {
                // Mapear storageKey a variable CSS
                const varMap = {
                    'custom-primary-color': '--primary-color',
                    'custom-primary-dark-color': '--primary-dark',
                    'custom-secondary-color': '--secondary-color',
                    'custom-accent-color': '--accent-color',
                    'custom-accent-dark-color': '--accent-dark',
                    'custom-background-light-color': '--background-light',
                    'custom-background-dark-color': '--background-dark',
                    'custom-text-color': '--text-color',
                    'custom-text-light-color': '--text-light-color',
                    'custom-border-color': '--border-color',
                    'custom-sidebar-bg-color': '--sidebar-bg',
                    'custom-sidebar-text-color': '--sidebar-text',
                    'custom-card-bg-color': '--card-bg',
                };
                if (varMap[key]) root.style.setProperty(varMap[key], value);
            }
        });
    }

    // Al abrir el modal, guardar el estado previo y usarlo como base temporal
    if (appearanceModal) {
        appearanceModal.addEventListener('show', () => {
            previousAppearanceState = getCurrentAppearanceState();
            tempAppearanceState = JSON.parse(JSON.stringify(previousAppearanceState));
        });
    }

    if (appearanceModal) {
        const body = document.body;
        const root = document.documentElement; // Para cambiar variables CSS en :root

        // --- Selectores de Elementos ---
        // Temas
        const themeOptionsContainer = appearanceModal.querySelector('.theme-options');
        // Tipografía
        const fontSizeSlider = document.getElementById('fontSizeSlider');
        // Colores Personalizados
        const customColorPickers = [
            { input: document.getElementById('customPrimaryColor'), variable: '--primary-color', storageKey: 'custom-primary-color' },
            { input: document.getElementById('customPrimaryDarkColor'), variable: '--primary-dark', storageKey: 'custom-primary-dark-color' },
            { input: document.getElementById('customSecondaryColor'), variable: '--secondary-color', storageKey: 'custom-secondary-color' },
            { input: document.getElementById('customAccentColor'), variable: '--accent-color', storageKey: 'custom-accent-color' },
            { input: document.getElementById('customAccentDarkColor'), variable: '--accent-dark', storageKey: 'custom-accent-dark-color' },
            { input: document.getElementById('customBackgroundLightColor'), variable: '--background-light', storageKey: 'custom-background-light-color' },
            { input: document.getElementById('customBackgroundDarkColor'), variable: '--background-dark', storageKey: 'custom-background-dark-color' },
            { input: document.getElementById('customTextColor'), variable: '--text-color', storageKey: 'custom-text-color' },
            { input: document.getElementById('customTextLightColor'), variable: '--text-light', storageKey: 'custom-text-light-color' },
            { input: document.getElementById('customBorderColor'), variable: '--border-color', storageKey: 'custom-border-color' },
            { input: document.getElementById('customSidebarBgColor'), variable: '--sidebar-bg', storageKey: 'custom-sidebar-bg-color' },
            { input: document.getElementById('customSidebarTextColor'), variable: '--sidebar-text', storageKey: 'custom-sidebar-text-color' },
            { input: document.getElementById('customCardBgColor'), variable: '--card-bg', storageKey: 'custom-card-bg-color' },
        ];

        const fontSizeValue = document.getElementById('fontSizeValue');
        const fontFamilySelect = document.getElementById('fontFamilySelect');
        // Barra Lateral
        const sidebarWidthSlider = document.getElementById('sidebarWidthSlider');
        const sidebarWidthValue = document.getElementById('sidebarWidthValue');
        const compactSidebarCheck = document.getElementById('compactSidebar');
        const iconsOnlyCheck = document.getElementById('sidebarIcons');

        // Botones de Acción
        const saveBtn = document.getElementById('saveAppearance');
        const resetBtn = document.getElementById('resetAppearance');
        const applyCustomColorsBtn = document.getElementById('applyCustomColorsBtn');

        /**
         * Aplica un ajuste de apariencia, lo actualiza en la UI y lo guarda en localStorage.
         * @param {string} property - Nombre de la variable CSS (ej. '--base-font-size').
         * @param {string} value - Nuevo valor (ej. '16px').
         * @param {string} storageKey - Clave para localStorage.
         */
        const applySetting = (property, value, storageKey) => {
            root.style.setProperty(property, value);
            localStorage.setItem(storageKey, value);
        };

        /**
         * Limpia cualquier configuración de color personalizada, tanto de la UI como de localStorage.
         */
        const clearCustomColors = () => {
            customColorPickers.forEach(picker => {
                root.style.removeProperty(picker.variable);
                localStorage.removeItem(picker.storageKey);
            });
        };

        /**
         * Restablece toda la configuración de apariencia a los valores por defecto.
         */
        const resetAppearanceSettings = () => {
            // 1. Limpiar todas las claves de configuración de localStorage
            const settingsKeys = [
                'selectedTheme', 'custom-primary-color', 'custom-secondary-color',
                'custom-accent-color', 'custom-background-color', 'fontSize',
                'fontFamily', 'sidebarWidth', 'sidebarCompact', 'sidebarIconsOnly',
                'custom-card-bg', 'custom-sidebar-bg', 'custom-sidebar-text', 'custom-background-dark'
            ];
            settingsKeys.forEach(key => localStorage.removeItem(key));

            // 2. Limpiar los estilos en línea aplicados al elemento :root
            root.style.cssText = '';

            // 3. Resetear los valores de los controles del modal a sus valores por defecto del HTML
            // Y quitar clases del body
            body.classList.remove('sidebar-compact', 'sidebar-icons-only');
            if (compactSidebarCheck) compactSidebarCheck.checked = false;
            if (iconsOnlyCheck) iconsOnlyCheck.checked = false;
            if (fontSizeSlider) {
                fontSizeSlider.value = fontSizeSlider.defaultValue;
                if (fontSizeValue) fontSizeValue.textContent = `${fontSizeSlider.defaultValue}px`;
            }
            if (fontFamilySelect) {
                fontFamilySelect.value = 'Inter'; // Asumiendo que 'Inter' es el valor por defecto
            }
            if (sidebarWidthSlider) {
                sidebarWidthSlider.value = sidebarWidthSlider.defaultValue;
                if (sidebarWidthValue) sidebarWidthValue.textContent = `${sidebarWidthSlider.defaultValue}px`;
            }
            customColorPickers.forEach(picker => {
                if (picker.input) {
                    picker.input.value = picker.input.defaultValue;
                    if (picker.preview) picker.preview.textContent = picker.input.defaultValue.toUpperCase();
                }
            });

            // 4. Re-aplicar el tema por defecto para que la UI se actualice inmediatamente
            applyTheme('default');
        };

        /**
         * Aplica un tema a la aplicación, actualiza la UI y guarda la preferencia.
         * @param {string} themeName - El nombre del tema (ej. 'dark', 'green').
         */
        const applyTheme = (themeName) => {
            // 1. Limpia cualquier clase de tema anterior del body para evitar conflictos.
            // Usamos una expresión regular para encontrar y quitar clases que empiecen con "theme-".
            // Si se aplica un tema predefinido, también limpiamos los colores personalizados.
            if (themeName !== 'custom') {
                clearCustomColors();
            }
            body.className = body.className.replace(/\btheme-\S+/g, '').trim();

            // 2. Aplica la nueva clase de tema si no es el tema por defecto.
            if (themeName && themeName !== 'default') {
                body.classList.add(`theme-${themeName}`);
            }

            // 3. Guarda la selección en localStorage para recordarla en futuras visitas.
            localStorage.setItem('selectedTheme', themeName);

            // 4. Actualiza el estado visual de los botones para marcar el tema activo.
            const allThemeOptions = themeOptionsContainer.querySelectorAll('.theme-option');
            allThemeOptions.forEach(opt => {
                opt.classList.remove('selected');
                if (opt.dataset.theme === themeName) {
                    opt.classList.add('selected');
                }
            });
        };

        // --- Event Listeners ---

        // 1. Temas Predefinidos
        // Eliminar el modo oscuro y agregar un tema azul moderno
        const themes = [
            { name: 'default', label: 'Cálido', class: 'default-theme', colors: ['#ff8a65', '#5d4037', '#66bb6a'] },
            { name: 'green', label: 'Verde', class: 'green-theme', colors: ['#27AE60', '#2ECC71', '#F39C12'] },
            { name: 'purple', label: 'Morado', class: 'purple-theme', colors: ['#8E44AD', '#9B59B6', '#E67E22'] },
            { name: 'orange', label: 'Naranja', class: 'orange-theme', colors: ['#E67E22', '#F39C12', '#27AE60'] },
            { name: 'red', label: 'Rojo', class: 'red-theme', colors: ['#E74C3C', '#C0392B', '#3498DB'] },
            { name: 'blue', label: 'Azul Moderno', class: 'blue-theme', colors: ['#4F8EF7', '#6C757D', '#28A745'] }
        ];
        themeOptionsContainer.innerHTML = '';
        themes.forEach(theme => {
            const option = document.createElement('div');
            option.className = `theme-option ${theme.class}`;
            option.dataset.theme = theme.name;
            option.innerHTML = `
                <div class="theme-preview">
                    <div class="theme-color primary" style="background:${theme.colors[0]}"></div>
                    <div class="theme-color secondary" style="background:${theme.colors[1]}"></div>
                    <div class="theme-color accent" style="background:${theme.colors[2]}"></div>
                </div>
                <span>${theme.label}</span>
            `;
            themeOptionsContainer.appendChild(option);
        });
        themeOptionsContainer.addEventListener('click', (event) => {
            const themeOption = event.target.closest('.theme-option');
            if (!themeOption) return; // Si el clic no fue en una opción, no hacer nada.

            const themeName = themeOption.dataset.theme;
            applyTheme(themeName);
        });

        // 3. Botones de Acción (Guardar y Restablecer)
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await showAlert('Configuración Guardada', 'Tus preferencias de apariencia han sido guardadas.');
                closeModal(appearanceModal);
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                const confirmed = await showConfirm(
                    'Restablecer Apariencia',
                    '¿Estás seguro de que deseas restablecer toda la apariencia a los valores por defecto? Esta acción no se puede deshacer.'
                );
                if (confirmed) {
                    resetAppearanceSettings();
                    await showAlert('Apariencia Restablecida', 'La configuración ha vuelto a su estado original.');
                }
            });
        }

        // 2. Colores Personalizados (Actualización en vivo del preview)
        customColorPickers.forEach(picker => {
            if (picker.input) {
                picker.input.addEventListener('input', () => {
                    const newColor = picker.input.value;
                    // Solo actualiza el texto del preview, no aplica el estilo
                    if (picker.preview) picker.preview.textContent = newColor.toUpperCase();
                });
            }
        });

        // Nuevo: Listener para el botón de aplicar colores personalizados
        if (applyCustomColorsBtn) {
            applyCustomColorsBtn.addEventListener('click', async () => {
                // Aplicar cada color personalizado
                customColorPickers.forEach(picker => {
                    if (picker.input) {
                        const newColor = picker.input.value;
                        root.style.setProperty(picker.variable, newColor);
                        localStorage.setItem(picker.storageKey, newColor);
                    }
                });

                // Marcar el tema como 'custom' y deseleccionar los predefinidos
                localStorage.setItem('selectedTheme', 'custom');
                themeOptionsContainer.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('selected'));
                await showAlert('Colores Aplicados', 'Tu paleta de colores personalizada ha sido aplicada.');
            });
        }

        // 2. Tipografía
        if (fontSizeSlider && fontSizeValue) {
            fontSizeSlider.addEventListener('input', () => {
                const newSize = `${fontSizeSlider.value}px`;
                fontSizeValue.textContent = newSize;
                applySetting('--base-font-size', newSize, 'fontSize');
            });
        }

        if (fontFamilySelect) {
            fontFamilySelect.addEventListener('change', () => {
                const newFamily = fontFamilySelect.value;
                // La fuente se aplica directamente desde la variable CSS
                applySetting('--base-font-family', `'${newFamily}', sans-serif`, 'fontFamily');
            });
        }

        // 3. Barra Lateral
        if (sidebarWidthSlider && sidebarWidthValue) {
            sidebarWidthSlider.addEventListener('input', () => {
                const newWidth = `${sidebarWidthSlider.value}px`;
                sidebarWidthValue.textContent = newWidth;
                applySetting('--sidebar-width', newWidth, 'sidebarWidth');
            });
        }

        // 4. Barra Lateral (Checkboxes)
        if (compactSidebarCheck) {
            compactSidebarCheck.addEventListener('change', () => {
                body.classList.toggle('sidebar-compact', compactSidebarCheck.checked);
                localStorage.setItem('sidebarCompact', compactSidebarCheck.checked);
            });
        }

        if (iconsOnlyCheck) {
            iconsOnlyCheck.addEventListener('change', () => {
                body.classList.toggle('sidebar-icons-only', iconsOnlyCheck.checked);
                localStorage.setItem('sidebarIconsOnly', iconsOnlyCheck.checked);
            });
        }


        /**
         * Carga todas las configuraciones de apariencia desde localStorage al iniciar.
         */
        const loadAppearanceSettings = () => {
            // Cargar Tema
            const savedTheme = localStorage.getItem('selectedTheme') || 'default';
            applyTheme(savedTheme);

            // Si el tema guardado es 'custom', cargar los colores personalizados.
            if (savedTheme === 'custom') {
                customColorPickers.forEach(picker => {
                    const savedColor = localStorage.getItem(picker.storageKey);
                    if (savedColor) {
                        root.style.setProperty(picker.variable, savedColor);
                        if (picker.input) picker.input.value = savedColor;
                        if (picker.preview) picker.preview.textContent = savedColor.toUpperCase();
                    }
                });
            }


            // Cargar Tamaño de Fuente
            const savedFontSize = localStorage.getItem('fontSize');
            if (savedFontSize) {
                root.style.setProperty('--base-font-size', savedFontSize);
                if (fontSizeSlider) fontSizeSlider.value = parseInt(savedFontSize, 10);
                if (fontSizeValue) fontSizeValue.textContent = savedFontSize;
            }

            // Cargar Familia de Fuente
            const savedFontFamily = localStorage.getItem('fontFamily');
            if (savedFontFamily) {
                root.style.setProperty('--base-font-family', `'${savedFontFamily}', sans-serif`);
                if (fontFamilySelect) fontFamilySelect.value = savedFontFamily;
            }

            // Cargar Ancho de Barra Lateral
            const savedSidebarWidth = localStorage.getItem('sidebarWidth');
            if (savedSidebarWidth) {
                root.style.setProperty('--sidebar-width', savedSidebarWidth);
                if (sidebarWidthSlider) sidebarWidthSlider.value = parseInt(savedSidebarWidth, 10);
                if (sidebarWidthValue) sidebarWidthValue.textContent = savedSidebarWidth;
            }

            // Cargar estado de la barra lateral (Compacto / Solo Iconos)
            const savedCompact = localStorage.getItem('sidebarCompact') === 'true';
            if (compactSidebarCheck) compactSidebarCheck.checked = savedCompact;
            if (savedCompact) body.classList.add('sidebar-compact');

            const savedIconsOnly = localStorage.getItem('sidebarIconsOnly') === 'true';
            if (iconsOnlyCheck) iconsOnlyCheck.checked = savedIconsOnly;
            if (savedIconsOnly) body.classList.add('sidebar-icons-only');

        };

        // Cargar toda la configuración al iniciar.
        loadAppearanceSettings();
    }

    if (projectStatusFilter) {
        projectStatusFilter.addEventListener('change', renderProjectListWithFilter);
    }

    // --- Lógica para Colaboradores (Filtros y Perfil) ---
    const collaboratorList = document.getElementById('collaborator-list');
    const collaboratorSearchInput = document.getElementById('collaborator-search-input');
    const collaboratorRoleFilter = document.getElementById('collaborator-role-filter');

    if (collaboratorSearchInput) {
        collaboratorSearchInput.addEventListener('input', applyCollaboratorFilters);
    }

    // --- Event Listener para Búsqueda Global ---
    const globalSearchInput = document.getElementById('globalSearchInput');
    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', (event) => {
            const searchTerm = event.target.value.trim();
            handleSearchInput(searchTerm);
        });

        // También permitir búsqueda al presionar Enter
        globalSearchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const searchTerm = event.target.value.trim();
                if (searchTerm.length >= 2) {
                    handleSearchInput(searchTerm);
                }
            }
        });
    }
    if (collaboratorRoleFilter) {
        collaboratorRoleFilter.addEventListener('change', applyCollaboratorFilters);
    }
    // Delegación de eventos para ver el perfil del colaborador
    if (collaboratorList) {
        collaboratorList.addEventListener('click', (event) => {
            const profileBtn = event.target.closest('.view-profile-btn');
            if (profileBtn) {
                const userId = profileBtn.dataset.userId;
                if (userId) {
                    showCollaboratorProfile(userId);
                }
            }
        });
    }
    // --- FILTROS Y ORDENAMIENTO DE TAREAS ---
    const sortTasksSelect = document.getElementById('sortTasksSelect');
    const applySortBtn = document.getElementById('applySortBtn');
    const filterOptions = document.querySelectorAll('.filters-bar .filter-option');

    // Event Listeners para Filtros y Ordenamiento de Tareas
    filterOptions.forEach(option => {
        option.addEventListener('click', () => {
            filterOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            applyFiltersAndSort();
        });
    });

    if (applySortBtn) {
        applySortBtn.addEventListener('click', applyFiltersAndSort);
    }

    // Manejo del formulario para añadir Proyecto
    const formAddProject = document.getElementById('formAddProject');
    if (formAddProject) {
        formAddProject.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(formAddProject);
            const projectData = Object.fromEntries(formData.entries());

            // Agregar campos obligatorios para el backend
            projectData.created_by = window.user_id || 1; // Usar window.user_id si está disponible, sino un valor por defecto
            const now = new Date();
            projectData.created_at = now.toISOString().slice(0, 19).replace('T', ' '); // Formato MySQL DATETIME

            try {
                const response = await fetch('/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(projectData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Error al crear el proyecto');
                }

                formAddProject.reset();
                closeModal(formAddProject.closest('.modal'));
                await loadAndRenderProjects(); // Recargar la lista de proyectos para reflejar el nuevo
                populateDropdowns(); // Recargar los proyectos en los selectores de tareas
                await showAlert('Proyecto Creado', 'El proyecto ha sido creado exitosamente.');

            } catch (error) {
                console.error('Error en la creación del proyecto:', error);
                await showAlert('Error al crear', `No se pudo crear el proyecto: ${error.message}`);
            }
        });
    }

    // Manejo del formulario para añadir Nota
    const formAddNote = document.getElementById('formAddNote');
    const modalAddNote = document.getElementById('modalAddNote');
    if (formAddNote) {
        formAddNote.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = document.getElementById('addNoteContent').value;
            const isPinned = document.getElementById('addNoteIsPinned').checked;
            if (!content.trim()) {
                await showAlert('Contenido Vacío', 'El contenido de la nota no puede estar vacío.');
                return;
            }
            try {
                const response = await fetch('/api/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: content, is_pinned: isPinned })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Error al crear la nota');
                }

                formAddNote.reset();
                closeModal(modalAddNote);
                await loadAndRenderNotes(); // Recargar la lista de notas ancladas del dashboard
                await loadAllNotes(); // Recargar la lista completa de notas
                await showAlert('Nota Creada', 'La nota ha sido creada exitosamente.');
            } catch (error) {
                await showAlert('Error al crear', `No se pudo crear la nota: ${error.message}`);
            }
        });
    }

    // --- Lógica para Editar y Eliminar Notas (en el dashboard y en la sección de notas) ---
    const modalEditNote = document.getElementById('modalEditNote');
    const formEditNote = document.getElementById('formEditNote');

    // Delegación de eventos para las notas (tanto en el dashboard como en la sección de notas)
    document.body.addEventListener('click', async (event) => {
        const noteItem = event.target.closest('.note-item, .note-card'); // Captura ambos tipos de elementos de nota
        if (!noteItem) return;

        const noteId = noteItem.dataset.noteId;

        // --- Lógica para Eliminar Nota ---
        if (event.target.closest('.delete-note-btn')) {
            const confirmed = await showConfirm('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar esta nota?');
            if (confirmed) {
                try {
                    const response = await fetch(`/api/notes/${noteId}`, {
                        method: 'DELETE'
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Error al eliminar la nota');
                    }
                    // Animación de salida y eliminación del DOM
                    noteItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    noteItem.style.opacity = '0';
                    noteItem.style.transform = 'scale(0.9)';
                    setTimeout(async () => {
                        noteItem.remove();
                        // Recargar ambas listas para asegurar la consistencia
                        await loadAndRenderNotes(); // Dashboard
                        await loadAllNotes(); // Sección de notas
                        await showAlert('Nota Eliminada', 'La nota ha sido eliminada exitosamente.');
                    }, 300);
                } catch (error) {
                    await showAlert('Error al eliminar', `No se pudo eliminar la nota: ${error.message}`);
                }
            }
        }

        // --- Lógica para Abrir Modal de Edición ---
        if (event.target.closest('.edit-note-btn')) {
            const noteContent = noteItem.querySelector('.note-text').textContent;
            // En MySQL, los booleanos a menudo se devuelven como 1 (true) o 0 (false)
            const isPinned = noteItem.dataset.isPinned === '1';

            document.getElementById('editNoteId').value = noteId;
            document.getElementById('editNoteContent').value = noteContent;
            document.getElementById('editNoteIsPinned').checked = isPinned;

            openModal('modalEditNote');
        }
    });

    // --- Lógica para Enviar Formulario de Edición de Nota ---
    if (formEditNote) {
        formEditNote.addEventListener('submit', async (e) => {
            e.preventDefault();
            const noteId = document.getElementById('editNoteId').value;
            const content = document.getElementById('editNoteContent').value;
            const isPinned = document.getElementById('editNoteIsPinned').checked;

            if (!content.trim()) {
                await showAlert('Contenido Vacío', 'El contenido de la nota no puede estar vacío.');
                return;
            }

            try {
                const response = await fetch(`/api/notes/${noteId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, is_pinned: isPinned })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Error al actualizar la nota');
                }

                closeModal(modalEditNote);
                await loadAndRenderNotes(); // Recargar la lista de notas ancladas
                await loadAllNotes(); // Recargar la lista completa de notas
                await showAlert('Nota Actualizada', 'La nota ha sido actualizada exitosamente.');

            } catch (error) {
                await showAlert('Error al actualizar', `No se pudo actualizar la nota: ${error.message}`);
            }
        });
    }

    // --- Lógica del Modo Enfoque (Pomodoro) MEJORADA ---
    const focusElements = {
        startBtn: document.getElementById('start-timer'),
        pauseBtn: document.getElementById('pause-timer'),
        resetBtn: document.getElementById('reset-timer'),
        minutesDisplay: document.getElementById('minutes'),
        secondsDisplay: document.getElementById('seconds'),
        statusDisplay: document.getElementById('timer-status'),
        taskToFocusSelect: document.getElementById('task-to-focus')
    };

    const focusSettings = {
        focusDuration: 25 * 60, // 25 minutos
        breakDuration: 5 * 60  // 5 minutos
    };

    let pomodoroInterval;
    let timeRemaining = focusSettings.focusDuration;
    let isPaused = true;
    let currentMode = 'focus'; // 'focus' o 'break'
    let currentFocusSessionId = null;
    let focusSessionActive = false;

    /**
     * Inicia el temporizador de Pomodoro y la sesión de enfoque de forma segura y secuencial.
     * Maneja la creación de una nueva sesión de enfoque si es necesario,
     * o simplemente reanuda el contador si ya estaba en pausa.
     */
    async function startTimerEnhanced() {
        // Si el temporizador ya está corriendo (no está pausado), no hacer nada para evitar múltiples intervalos.
        if (!isPaused) {
            return;
        }

        // Si no hay una sesión de enfoque activa, significa que es un nuevo inicio.
        if (!focusSessionActive) {
            // 1. Intentar iniciar la sesión en el backend. Esto incluye la validación de la tarea.
            const sessionData = await startFocusSession();

            // 2. Si la sesión no se pudo crear (p. ej., no se seleccionó tarea), la función se detiene.
            // La alerta al usuario ya fue mostrada por startFocusSession.
            if (!sessionData) {
                return;
            }

            // 3. Si la sesión se creó con éxito, actualizamos el estado y notificamos al usuario.
            focusSessionActive = true;
            currentFocusSessionId = sessionData.session_id;
            await showAlert('Sesión Iniciada', 'Sesión de enfoque iniciada. ¡A concentrarse!');
        }

        // 4. Marcar como no pausado y actualizar la UI a 'activa'.
        // Esto se hace tanto para un nuevo inicio como para una reanudación.
        isPaused = false;
        updateFocusUI('active');

        // 5. Iniciar (o reanudar) el intervalo del temporizador visual.
        pomodoroInterval = setInterval(async () => {
            timeRemaining--;
            updateTimerDisplay(timeRemaining);

            if (timeRemaining < 0) {
                clearInterval(pomodoroInterval);
                const wasFocusMode = currentMode === 'focus';

                if (currentMode === 'focus') {
                    currentMode = 'break';
                    timeRemaining = focusSettings.breakDuration;
                } else {
                    currentMode = 'focus';
                    timeRemaining = focusSettings.focusDuration;
                }

                // Finalizar la sesión de enfoque solo si estábamos en modo 'focus'.
                if (wasFocusMode) {
                    const endedSessionData = await endFocusSession();
                    if (endedSessionData) {
                        await showAlert('¡Tiempo de Enfoque Terminado!', `Sesión completada: ${endedSessionData.duration_minutes} minutos. Comienza tu descanso.`);
                        // FIX: Actualizar las estadísticas después de completar una sesión.
                        loadFocusStats();
                        loadChartJsAndRenderAnalytics();
                    }
                } else {
                    await showAlert('¡Descanso Terminado!', 'Es hora de volver a enfocarse.');
                }

                isPaused = true;
                focusSessionActive = false; // La sesión ha terminado, se puede iniciar una nueva.
                updateTimerDisplay(timeRemaining);
                updateFocusUI('inactive'); // Reinicia la UI del temporizador
            }
        }, 1000);
    }

    // Pausa el temporizador localmente sin afectar la sesión del backend.
    function pauseTimerEnhanced() {
        if (!focusSessionActive) return; // No se puede pausar si no hay sesión activa
        isPaused = true;
        clearInterval(pomodoroInterval);
        updateFocusUI('paused');
    }

    // Reinicia el temporizador y descarta la sesión de enfoque actual del backend.
    async function resetTimerEnhanced() {
        clearInterval(pomodoroInterval);
        isPaused = true;

        // Si había una sesión activa en el backend, la descartamos.
        if (focusSessionActive) {
            try {
                // FIX: Al resetear, la sesión se finaliza en el backend para que el tiempo cuente.
                const response = await fetch('/api/focus/discard_session', { method: 'POST' });
                if (response.ok) {
                    loadFocusStats();
                    loadChartJsAndRenderAnalytics();
                }
                console.log("Sesión de enfoque activa descartada.");
            } catch (error) {
                console.error("Error al descartar la sesión de enfoque:", error);
                // No bloqueamos al usuario, pero registramos el error.
            }
        }

        // Reseteamos todas las variables de estado locales.
        focusSessionActive = false;
        currentFocusSessionId = null;
        currentMode = 'focus';
        timeRemaining = focusSettings.focusDuration;
        updateTimerDisplay(timeRemaining);
        updateFocusUI('inactive');
    }

    // Asigna los event listeners a los botones del temporizador.
    if (focusElements.startBtn) focusElements.startBtn.addEventListener('click', startTimerEnhanced);
    if (focusElements.pauseBtn) focusElements.pauseBtn.addEventListener('click', pauseTimerEnhanced);
    if (focusElements.resetBtn) focusElements.resetBtn.addEventListener('click', resetTimerEnhanced);

    updateTimerDisplay(timeRemaining); // Inicializar el display al cargar la página
    updateFocusUI('inactive'); // Inicializar la UI de enfoque
    loadTasksForFocus(); // Cargar tareas para el selector de enfoque
    loadFocusStats(); // Cargar estadísticas de enfoque

    // --- Event listeners para la sección de notas ---
    const notesFilter = document.getElementById('notes-filter');
    const notesViewToggle = document.getElementById('notes-view-toggle');
    const viewAllNotesBtn = document.querySelector('.view-all-notes-btn');

    if (notesFilter) {
        notesFilter.addEventListener('change', renderAllNotes);
    }

    if (notesViewToggle) {
        notesViewToggle.addEventListener('click', () => {
            notesView = notesView === 'grid' ? 'list' : 'grid';
            const icon = notesViewToggle.querySelector('i');
            const textSpan = notesViewToggle.querySelector('span'); // Asumiendo que el texto está en un span
            if (notesView === 'list') {
                icon.className = 'fas fa-list';
                if (textSpan) textSpan.textContent = ' Vista Lista';
                notesViewToggle.setAttribute('aria-label', 'Cambiar a vista de cuadrícula');
            } else {
                icon.className = 'fas fa-th-large';
                if (textSpan) textSpan.textContent = ' Vista Cuadrícula';
                notesViewToggle.setAttribute('aria-label', 'Cambiar a vista de lista');
            }
            renderAllNotes();
        });
    }

    // Delegación de eventos para las tarjetas de notas
    const allNotesList = document.getElementById('all-notes-list'); // Re-obtener referencia localmente
    if (allNotesList) {
        allNotesList.addEventListener('click', async (event) => {
            const noteCard = event.target.closest('.note-card');
            if (!noteCard) return;

            const noteId = noteCard.dataset.noteId;
            const isPinned = noteCard.dataset.isPinned === '1'; // Usar '1' o '0' como en el HTML

            // Manejar anclado/desanclado
            if (event.target.closest('.pin-note')) {
                await toggleNotePin(noteId, isPinned);
                return;
            }

            // Eliminar nota
            if (event.target.closest('.delete-note-btn')) { // Cambiado a .delete-note-btn
                const confirmed = await showConfirm('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar esta nota?');
                if (confirmed) {
                    try {
                        const response = await fetch(`/api/notes/${noteId}`, {
                            method: 'DELETE'
                        });
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Error al eliminar la nota');
                        }

                        // Remover del array y re-renderizar
                        allNotes = allNotes.filter(note => note.note_id != noteId);
                        renderAllNotes();

                        // También recargar las notas del dashboard
                        await loadAndRenderNotes();
                        await showAlert('Nota Eliminada', 'La nota ha sido eliminada exitosamente.');

                    } catch (error) {
                        await showAlert('Error al eliminar', `No se pudo eliminar la nota: ${error.message}`);
                    }
                }
                return;
            }

            // Editar nota
            if (event.target.closest('.edit-note-btn')) { // Cambiado a .edit-note-btn
                const note = allNotes.find(n => n.note_id == noteId);
                if (note) {
                    document.getElementById('editNoteId').value = note.note_id;
                    document.getElementById('editNoteContent').value = note.content;
                    document.getElementById('editNoteIsPinned').checked = note.is_pinned;
                    openModal('modalEditNote');
                }
            }
        });
    }

    // Botón "Ver todas las notas" desde el dashboard
    if (viewAllNotesBtn) {
        viewAllNotesBtn.addEventListener('click', () => {
            showSection('notas'); // Usar el nombre de la sección sin '-section'
        });
    }

    // --- Event Listeners para Recursos ---
    const resourceGrid = document.getElementById('resource-grid'); // Re-obtener referencia localmente
    if (resourceGrid) {
        resourceGrid.addEventListener('click', async (event) => {
            const resourceCard = event.target.closest('.resource-card');
            if (!resourceCard) return;

            const resourceId = resourceCard.dataset.resourceId;
            const resource = allResources.find(r => r.resource_id == resourceId);

            if (event.target.closest('.view-resource-btn')) { // Cambiado a .view-resource-btn
                if (resource && resource.url_or_path) {
                    window.open(resource.url_or_path, '_blank');
                }
            }

            if (event.target.closest('.delete-resource-btn')) {
                const confirmed = await showConfirm('Confirmar Eliminación', '¿Estás seguro de que deseas eliminar este recurso?');
                if (confirmed) {
                    try {
                        const response = await fetch(`/api/resources/${resourceId}`, {
                            method: 'DELETE'
                        });
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Error al eliminar el recurso');
                        }

                        allResources = allResources.filter(r => r.resource_id != resourceId);
                        renderAllResources();
                        await showAlert('Recurso Eliminado', 'El recurso ha sido eliminado exitosamente.');

                    } catch (error) {
                        await showAlert('Error al eliminar', `No se pudo eliminar el recurso: ${error.message}`);
                    }
                }
            }
        });
    }

    // Manejo del formulario para añadir Recurso
    const formAddResource = document.getElementById('formAddResource');
    const modalAddResource = document.getElementById('modalAddResource');
    const resourceTypeSelect = document.getElementById('resourceType');
    const resourceFileContainer = document.getElementById('resourceFileInputContainer');
    const resourceUrlContainer = document.getElementById('resourceUrlInputContainer');

    // Cambiar entre subida de archivo y URL según el tipo
    if (resourceTypeSelect) {
        resourceTypeSelect.addEventListener('change', () => {
            const selectedType = resourceTypeSelect.value;

            if (selectedType === 'link' || selectedType === 'video') {
                // Mostrar campo de URL, ocultar campo de archivo
                if (resourceFileContainer) resourceFileContainer.style.display = 'none';
                if (resourceUrlContainer) resourceUrlContainer.style.display = 'block';
                const resourceUrlInput = document.getElementById('resourceUrl');
                const resourceFileInput = document.getElementById('resourceFile');
                if (resourceUrlInput) resourceUrlInput.required = true;
                if (resourceFileInput) resourceFileInput.required = false;
            } else {
                // Mostrar campo de archivo, ocultar campo de URL
                if (resourceFileContainer) resourceFileContainer.style.display = 'block';
                if (resourceUrlContainer) resourceUrlContainer.style.display = 'none';
                const resourceUrlInput = document.getElementById('resourceUrl');
                const resourceFileInput = document.getElementById('resourceFile');
                if (resourceUrlInput) resourceUrlInput.required = false;
                if (resourceFileInput) resourceFileInput.required = false; // Opcional para flexibilidad
            }
        });
    }

    if (formAddResource) {
        formAddResource.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(formAddResource);

            try {
                const response = await fetch('/api/resources', {
                    method: 'POST',
                    body: formData // Usar FormData directamente para soportar archivos
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Error al crear el recurso');
                }

                const newResource = await response.json();

                // Añadir al array y re-renderizar
                allResources.unshift(newResource); // Añadir al principio
                renderAllResources();

                formAddResource.reset();
                closeModal(modalAddResource);

                // Resetear la visibilidad de los campos
                if (resourceFileContainer) resourceFileContainer.style.display = 'block';
                if (resourceUrlContainer) resourceUrlContainer.style.display = 'none';
                await showAlert('Recurso Creado', 'El recurso ha sido creado exitosamente.');

            } catch (error) {
                console.error('Error en la creación del recurso:', error);
                await showAlert('Error al crear', `No se pudo crear el recurso: ${error.message}`);
            }
        });
    }

    // --- FUNCIONALIDAD PARA SELECCIONAR TAREA EN MODO ENFOQUE ---
    const taskToFocusSelect = document.getElementById('task-to-focus');
    if (taskToFocusSelect) {
        taskToFocusSelect.addEventListener('change', (e) => {
            currentFocusTaskId = e.target.value ? parseInt(e.target.value) : null;
            loadFocusObjectives(currentFocusTaskId); // Cargar objetivos al cambiar de tarea
        });
    }

    // --- FUNCIONALIDAD DE OBJETIVOS DE ENFOQUE ---
    const focusObjectivesForm = document.getElementById('focusObjectivesForm');
    const focusObjectiveInput = document.getElementById('focusObjectiveInput');
    const focusObjectivesList = document.getElementById('focusObjectivesList');

    // Agregar objetivo
    if (focusObjectivesForm) {
        focusObjectivesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = focusObjectiveInput.value.trim();
            if (!text || !currentFocusTaskId) {
                await showAlert('Información Faltante', 'Por favor, escribe un objetivo y selecciona una tarea.');
                return;
            }
            try {
                const resp = await fetch('/focus_objectives', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task_id: currentFocusTaskId, objective_text: text })
                });
                if (!resp.ok) throw new Error('No se pudo agregar el objetivo');
                focusObjectiveInput.value = '';
                await loadFocusObjectives(currentFocusTaskId);
                await showAlert('Objetivo Añadido', 'Objetivo añadido exitosamente.');
            } catch (e) {
                await showAlert('Error', 'Error al agregar objetivo: ' + e.message);
            }
        });
    }

    // Delegación para check, editar y eliminar objetivos
    if (focusObjectivesList) {
        focusObjectivesList.addEventListener('click', async (e) => {
            const li = e.target.closest('.focus-objective-item');
            if (!li) return;
            const objectiveId = parseInt(li.dataset.objectiveId); // Asegurarse de que sea un número

            // Marcar como completado
            if (e.target.classList.contains('focus-objective-check')) {
                const isChecked = e.target.checked;
                try {
                    const resp = await fetch(`/focus_objectives/${objectiveId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ completed: isChecked })
                    });
                    if (!resp.ok) throw new Error('No se pudo marcar como completado');
                    await loadFocusObjectives(currentFocusTaskId); // Recargar para actualizar UI
                } catch (e) {
                    await showAlert('Error', 'No se pudo marcar como completado: ' + e.message);
                    e.target.checked = !isChecked; // Revertir UI
                }
            }
            // Eliminar
            if (e.target.closest('.focus-objective-delete')) {
                const confirmed = await showConfirm('Confirmar Eliminación', '¿Eliminar este objetivo?');
                if (confirmed) {
                    try {
                        await fetch(`/focus_objectives/${objectiveId}`, { method: 'DELETE' });
                        await loadFocusObjectives(currentFocusTaskId);
                        await showAlert('Eliminado', 'Objetivo eliminado exitosamente.');
                    } catch (e) {
                        await showAlert('Error', 'No se pudo eliminar: ' + e.message);
                    }
                }
            }
        });
        // Editar texto (al perder foco)
        focusObjectivesList.addEventListener('focusout', async (e) => {
            const span = e.target.closest('.focus-objective-text');
            if (!span) return;
            const li = span.closest('.focus-objective-item');
            if (!li) return;
            const objectiveId = parseInt(li.dataset.objectiveId);
            const newText = span.textContent.trim();
            if (!newText) {
                await showAlert('Contenido Vacío', 'El objetivo no puede estar vacío.');
                // Opcional: recargar para restaurar el texto original si no se guarda
                await loadFocusObjectives(currentFocusTaskId);
                return;
            }
            try {
                const resp = await fetch(`/focus_objectives/${objectiveId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ objective_text: newText })
                });
                if (!resp.ok) throw new Error('No se pudo editar el objetivo');
                await showAlert('Actualizado', 'Objetivo actualizado exitosamente.');
            } catch (e) {
                await showAlert('Error', 'No se pudo editar el objetivo: ' + e.message);
            }
        });
    }

    // --- LÓGICA PARA AÑADIR COLABORADOR ---
    const formAddUser = document.getElementById('formAddUser');
    if (formAddUser) {
        formAddUser.addEventListener('submit', async (event) => {
            event.preventDefault();
            const modal = formAddUser.closest('.modal');
            const submitButton = formAddUser.querySelector('button[type="submit"]');
            const originalButtonHTML = submitButton.innerHTML;

            const formData = new FormData(formAddUser);
            const userData = Object.fromEntries(formData.entries());

            // Validación simple en el cliente
            if (userData.password.length < 8) {
                await showAlert('Contraseña Débil', 'La contraseña debe tener al menos 8 caracteres.');
                return;
            }

            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
            submitButton.disabled = true;

            try {
                const response = await fetch('/api/users/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData)
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Ocurrió un error desconocido.');
                }

                await showAlert('Éxito', result.message);
                formAddUser.reset();
                closeModal(modal);
                // Recargar la lista de colaboradores para mostrar el nuevo usuario
                await loadAndRenderCollaborators();

            } catch (error) {
                await showAlert('Error al Crear Usuario', error.message);
            } finally {
                submitButton.innerHTML = originalButtonHTML;
                submitButton.disabled = false;
            }
        });
    }

    // --- LÓGICA PARA LA PÁGINA DE REGISTRO PÚBLICA ---
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageContainer = document.getElementById('message-container');
            const submitButton = registerForm.querySelector('button[type="submit"]');
            const originalButtonHTML = submitButton.innerHTML;

            const formData = new FormData(registerForm);
            const userData = Object.fromEntries(formData.entries());

            // Validación simple en el cliente
            if (userData.password.length < 8) {
                messageContainer.innerHTML = `<div class="message error">La contraseña debe tener al menos 8 caracteres.</div>`;
                return;
            }

            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
            submitButton.disabled = true;
            messageContainer.innerHTML = ''; // Limpiar mensajes previos

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData)
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Ocurrió un error desconocido.');
                }

                // Éxito
                messageContainer.innerHTML = `<div class="message success">${result.message}</div>`;
                registerForm.reset();
                // Redirigir al login después de un momento para que el usuario vea el mensaje
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);

            } catch (error) {
                messageContainer.innerHTML = `<div class="message error">${error.message}</div>`;
            } finally {
                submitButton.innerHTML = originalButtonHTML;
                submitButton.disabled = false;
            }
        });
    }

    // --- LÓGICA PARA LA PÁGINA DE "OLVIDÉ MI CONTRASEÑA" ---
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageContainer = document.getElementById('message-container');
            const submitButton = forgotPasswordForm.querySelector('button[type="submit"]');
            const originalButtonHTML = submitButton.innerHTML;

            const email = document.getElementById('forgotEmail').value;

            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            submitButton.disabled = true;
            messageContainer.innerHTML = '';

            try {
                const response = await fetch('/api/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Ocurrió un error desconocido.');
                }

                // Siempre mostrar mensaje de éxito para no revelar si un email existe o no
                messageContainer.innerHTML = `<div class="message success">${result.message}</div>`;
                forgotPasswordForm.reset();

            } catch (error) {
                // En caso de un error del servidor, sí lo mostramos
                messageContainer.innerHTML = `<div class="message error">${error.message}</div>`;
            } finally {
                submitButton.innerHTML = originalButtonHTML;
                submitButton.disabled = false;
            }
        });
    }

    // --- LÓGICA PARA LA PÁGINA DE "RESTABLECER CONTRASEÑA" ---
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageContainer = document.getElementById('message-container');
            const submitButton = resetPasswordForm.querySelector('button[type="submit"]');
            const originalButtonHTML = submitButton.innerHTML;

            const formData = new FormData(resetPasswordForm);
            const data = Object.fromEntries(formData.entries());

            if (data.password.length < 8) {
                messageContainer.innerHTML = `<div class="message error">La contraseña debe tener al menos 8 caracteres.</div>`;
                return;
            }
            if (data.password !== data.confirm_password) {
                messageContainer.innerHTML = `<div class="message error">Las contraseñas no coinciden.</div>`;
                return;
            }

            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            submitButton.disabled = true;
            messageContainer.innerHTML = '';

            try {
                const response = await fetch('/api/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: data.token, password: data.password })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);

                messageContainer.innerHTML = `<div class="message success">${result.message}</div>`;
                setTimeout(() => window.location.href = '/login', 2500);
            } catch (error) {
                messageContainer.innerHTML = `<div class="message error">${error.message}</div>`;
                submitButton.innerHTML = originalButtonHTML;
                submitButton.disabled = false;
            }
        });
    }
    /**
     * Popula un dropdown de roles.
     * @param {string} selectId - El ID del elemento <select> a poblar.
     */
    async function populateRoleDropdown(selectId) {
        const selectElement = document.getElementById(selectId);
        if (!selectElement) return;
        try {
            const response = await fetch('/api/roles');
            const roles = await response.json();
            selectElement.innerHTML = '<option value="">Selecciona un rol...</option>'; // Reset
            roles.forEach(role => {
                selectElement.add(new Option(role, role));
            });
        } catch (error) {
            console.error(`Error al poblar roles para ${selectId}:`, error);
        }
    }

    // --- INICIALIZACIÓN DE LA APLICACIÓN ---
    // Estas llamadas deben ir al final de DOMContentLoaded para asegurar que todos los elementos y funciones estén disponibles.
    loadAndRenderTasks();
    loadAndRenderProjects();
    populateDropdowns(); // Carga los datos para los selectores de los formularios
    loadFocusStats(); // Cargar estadísticas de enfoque al iniciar
    loadAndRenderNotes(); // Cargar notas importantes en el dashboard
    loadRecentActivity();
    loadAllNotes(); // Cargar todas las notas para la sección de notas
    loadAllResources(); // Cargar todos los recursos para la sección de recursos
    populateFocusTaskSelect(); // Cargar tareas para el selector de modo enfoque
    // Inicializar con la tarea seleccionada (si hay una por defecto)
    if (taskToFocusSelect && taskToFocusSelect.value) {
        currentFocusTaskId = taskToFocusSelect.value;
        loadFocusObjectives(currentFocusTaskId);
    }

    // --- LÓGICA PARA GESTIONAR ROLES ---

    /**
     * Carga los roles desde la API y los renderiza en el modal de gestión.
     */
    async function loadAndRenderRoles() {
        const roleList = document.getElementById('role-management-list');
        if (!roleList) return;

        // Mostrar estado de carga
        roleList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando roles...</p>
            </div>`;

        try {
            const response = await fetch('/api/roles');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'No se pudieron cargar los roles.');
            }
            const roles = await response.json();
            renderRoleManagementList(roles);
        } catch (error) {
            console.error('Error al cargar roles:', error);
            roleList.innerHTML = `<div class="error-state"><p>${error.message}</p></div>`;
        }
    }

    /**
     * Renderiza la lista de roles en el modal.
     * @param {string[]} roles - Un array con los nombres de los roles.
     */
    function renderRoleManagementList(roles) {
        const roleList = document.getElementById('role-management-list');
        if (!roleList) return;

        roleList.innerHTML = ''; // Limpiar estado de carga/previo

        if (roles.length === 0) {
            roleList.innerHTML = `<li class="empty-role-state">No hay roles personalizados para gestionar.</li>`;
            return;
        }

        roles.forEach(role => {
            const isDefaultRole = role.toLowerCase() === 'colaborador';
            const li = document.createElement('li');
            li.className = 'role-management-item';
            li.dataset.roleName = role;
            li.innerHTML = `
                <input type="text" class="role-name-input" value="${role}" ${isDefaultRole ? 'disabled' : ''}>
                <div class="role-item-actions">
                    <button class="action-btn save-role-btn" ${isDefaultRole ? 'disabled' : ''} title="Guardar cambios"><i class="fas fa-save"></i></button>
                    <button class="action-btn delete-role-btn" ${isDefaultRole ? 'disabled' : ''} title="Eliminar rol"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            roleList.appendChild(li);
        });
    }

    // Delegación de eventos para el modal de gestión de roles
    const modalManageRoles = document.getElementById('modalManageRoles');
    if (modalManageRoles) {
        modalManageRoles.addEventListener('click', async (event) => {
            const roleItem = event.target.closest('.role-management-item');
            if (!roleItem) return;

            const oldRoleName = roleItem.dataset.roleName;
            const newRoleNameInput = roleItem.querySelector('.role-name-input');
            const newRoleName = newRoleNameInput.value.trim();

            // Manejar Guardar (Actualizar)
            if (event.target.closest('.save-role-btn')) {
                if (!newRoleName || newRoleName === oldRoleName) return;

                const confirmed = await showConfirm('Confirmar Actualización', `¿Cambiar el rol "${oldRoleName}" a "${newRoleName}" para todos los usuarios afectados?`);
                if (confirmed) {
                    // Deshabilitar controles para evitar dobles clics
                    const saveBtn = roleItem.querySelector('.save-role-btn');
                    const deleteBtn = roleItem.querySelector('.delete-role-btn');
                    saveBtn.disabled = true;
                    deleteBtn.disabled = true;
                    newRoleNameInput.disabled = true;
                    try {
                        const response = await fetch('/api/roles/update', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ old_name: oldRoleName, new_name: newRoleName })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || 'Error desconocido');
                        await showAlert('Éxito', result.message);
                        loadAndRenderRoles();
                        loadAndRenderCollaborators();
                    } catch (error) {
                        await showAlert('Error', `No se pudo actualizar el rol: ${error.message}`);
                        // Reactivar en caso de error
                        saveBtn.disabled = false;
                        deleteBtn.disabled = false;
                        newRoleNameInput.disabled = false;
                    }
                }
            }

            // Manejar Eliminar
            if (event.target.closest('.delete-role-btn')) {
                const confirmed = await showConfirm('Confirmar Eliminación', `¿Eliminar el rol "${oldRoleName}"? Los usuarios serán reasignados a "Colaborador".`);
                if (confirmed) {
                    // Deshabilitar controles para evitar dobles clics
                    const saveBtn = roleItem.querySelector('.save-role-btn');
                    const deleteBtn = roleItem.querySelector('.delete-role-btn');
                    saveBtn.disabled = true;
                    deleteBtn.disabled = true;
                    newRoleNameInput.disabled = true;
                    try {
                        const response = await fetch('/api/roles/delete', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role_name: oldRoleName })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || 'Error desconocido');
                        await showAlert('Éxito', result.message);
                        loadAndRenderRoles();
                        loadAndRenderCollaborators();
                    } catch (error) {
                        await showAlert('Error', `No se pudo eliminar el rol: ${error.message}`);
                        saveBtn.disabled = false;
                        deleteBtn.disabled = false;
                        newRoleNameInput.disabled = false;
                    }
                }
            }
        });
    }
});
