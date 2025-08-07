# TaskManager Pro: Gestor de Tareas y Productividad

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1-black.svg)](https://flask.palletsprojects.com/)
[![MySQL](https://img.shields.io/badge/MySQL-blue.svg)](https://www.mysql.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Un sistema integral de gestión de tareas y productividad construido con **Flask** y **MySQL**. Diseñado para ayudar a los usuarios a organizar sus proyectos, gestionar tareas y mejorar su concentración con un modo de enfoque inspirado en la técnica Pomodoro.

## 📸 Vistazo a la Aplicación

¡Así luce TaskManager Pro en acción! A continuación, se muestran algunas de las interfaces clave de la aplicación.

| Dashboard Principal | Vista de Proyectos |
| :---: | :---: |
| ![Dashboard de TaskManager Pro](screenshots/dashboard.png) | ![Vista de Proyectos en modo cuadrícula](screenshots/projects_grid.png) |

| Modo Enfoque (Pomodoro) | Gestión de Colaboradores |
| :---: | :---: |
| ![Modo Enfoque con objetivos y temporizador](screenshots/focus_mode.png) | ![Página de gestión de colaboradores](screenshots/collaborators.png) |

## 🚀 Funcionalidades Destacadas

-   **Gestión de Usuarios Completa:** Registro, inicio de sesión seguro (contraseñas hasheadas con Bcrypt) y recuperación de contraseña mediante token.
-   **Dashboard Interactivo:** Visualiza estadísticas clave de tu productividad, actividad reciente y notas importantes.
-   **Gestión de Proyectos y Tareas:** Crea proyectos y asigna tareas con fechas de vencimiento, prioridades y estados.
-   **Modo Enfoque (Pomodoro):** Temporizador para sesiones de trabajo concentrado, asociado a tareas específicas y con registro de objetivos.
-   **Roles y Permisos:** Sistema de roles (Administrador, Colaborador, Invitado) para controlar el acceso a las funcionalidades.
-   **Analíticas y Reportes:** Gráficos sobre el progreso de tareas y distribución de trabajo. Exportación de datos a CSV.
-   **Personalización:** Sube tu propio avatar y personaliza la apariencia de la aplicación.
-   **Gestión de Recursos:** Almacena enlaces, documentos e imágenes útiles.
-   **Búsqueda Global:** Encuentra rápidamente tareas, proyectos o notas.

## 🛠️ Tecnologías utilizadas

-   **Backend:** Python, Flask
-   **Base de Datos:** MySQL
-   **Seguridad:** Flask-Bcrypt para hashing de contraseñas.
-   **Frontend:** HTML, CSS, JavaScript (Vanilla)
-   **Librerías Clave:** `mysql-connector-python`, `flask-cors`.

## ⚙️ Instalación y Puesta en Marcha

Sigue estos pasos para configurar y ejecutar el proyecto en tu entorno local.

### 1. Prerrequisitos

-   **Python 3.10** o superior.
-   **MySQL Server** instalado y en ejecución.
-   **Git** para clonar el repositorio.

### 2. Clonar el Repositorio

```bash
git clone https://github.com/tu_usuario/taskmanager.git
cd taskmanager/todo-app
```

### 3. Configurar el Entorno Virtual

Es una buena práctica usar un entorno virtual para aislar las dependencias del proyecto.

```bash
# Crear el entorno virtual
python -m venv venv

# Activarlo
# En Windows:
venv\Scripts\activate
# En macOS/Linux:
source venv/bin/activate
```

### 4. Instalar Dependencias

Instala todas las librerías de Python necesarias con pip.

```bash
pip install -r requirements.txt
```

### 5. Configurar la Base de Datos

1.  Accede a tu cliente de MySQL (línea de comandos, MySQL Workbench, etc.).
2.  Crea una nueva base de datos para el proyecto.

    ```sql
    CREATE DATABASE project_hub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    ```

3.  Importa la estructura de la base de datos. El archivo `schema.sql` se encuentra en la raíz del proyecto y contiene todas las tablas necesarias. Ejecuta el siguiente comando para importarlo:

    ```bash
    # Reemplaza 'tu_usuario' con tu nombre de usuario de MySQL
    mysql -u tu_usuario -p project_hub < schema.sql
    ```

### 6. Configurar las Variables de Entorno

La aplicación necesita credenciales para conectarse a la base de datos.

1.  Crea un archivo llamado `.env` en la raíz del directorio `todo-app`.
2.  Copia el contenido de `.env.example` (si existe) o añade las siguientes variables, ajustando los valores a tu configuración de MySQL:

    ```ini
    # .env
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=tu_contraseña_de_mysql
    DB_NAME=project_hub
    FLASK_SECRET_KEY=genera_una_clave_secreta_aqui
    ```

    *   **`FLASK_SECRET_KEY`**: Es crucial para la seguridad de las sesiones. Puedes generar una con Python:
        `python -c 'import secrets; print(secrets.token_hex(16))'`

### 7. Ejecutar la Aplicación

Una vez que todo está configurado, inicia el servidor de desarrollo de Flask.

```bash
python app.py
```

La aplicación estará disponible en `http://127.0.0.1:5000`.

## 📁 Estructura del Proyecto

```
todo-app/
├── app.py              # Lógica principal de Flask, rutas y API.
├── requirements.txt    # Dependencias de Python.
├── static/
│   ├── styles.css      # Estilos principales.
│   ├── script.js       # Lógica del frontend.
│   └── images/         # Imágenes estáticas.
├── templates/
│   ├── index.html      # Plantilla principal del dashboard.
│   ├── login.html      # Página de inicio de sesión.
│   └── ...             # Otras plantillas HTML.
├── uploads/            # Directorio para archivos subidos (avatares, recursos).
├── .gitignore          # Archivos y directorios a ignorar por Git.
└── README.md           # Este archivo.
```

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Si deseas mejorar el proyecto, por favor sigue estos pasos:

1.  Haz un Fork del proyecto.
2.  Crea una nueva rama (`git checkout -b feature/NuevaFuncionalidad`).
3.  Realiza tus cambios y haz commit (`git commit -m 'Añade NuevaFuncionalidad'`).
4.  Haz push a la rama (`git push origin feature/NuevaFuncionalidad`).
5.  Abre un Pull Request.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.