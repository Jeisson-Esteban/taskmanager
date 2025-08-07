# --- Importación de librerías necesarias ---
# Flask y extensiones para creación de servidor web, seguridad y manejo de sesiones
from flask import Flask, jsonify, request, render_template, redirect, url_for, session, send_from_directory, Response
from flask_cors import CORS  # Para permitir peticiones desde otros dominios (CORS)
from flask_bcrypt import Bcrypt  # Para encriptar contraseñas
# Conexión a base de datos MySQL
import mysql.connector
# Utilidades del sistema y manejo de fechas
import secrets
from datetime import datetime, timedelta
import io
import csv
import os
import random
import string
from werkzeug.utils import secure_filename  # Asegura nombres de archivos válidos al subir

# --- Configuración de la aplicación Flask ---
app = Flask(__name__)  # Crea la instancia principal de la aplicación web

# --- Inicialización de extensiones ---
bcrypt = Bcrypt(app)  # Inicializa bcrypt para hashing de contraseñas
app.secret_key = secrets.token_hex(16)  # Genera una clave secreta aleatoria para manejar sesiones de usuario

# --- Configuración del directorio para cargas de archivos ---
UPLOAD_FOLDER = os.path.join(app.root_path, 'uploads')  # Carpeta donde se guardan los archivos subidos
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)  # Crea la carpeta si no existe

# --- Habilitación de CORS (Cross-Origin Resource Sharing) ---
CORS(app)  # Permite que otros dominios puedan consumir las APIs

# --- Middleware de seguridad: Se ejecuta después de cada respuesta HTTP ---
@app.after_request
def add_security_headers(response):
    """
    Añade encabezados HTTP de seguridad a todas las respuestas:
    - Política CSP (Content Security Policy) para controlar recursos permitidos.
    - Prevención contra ataques XSS y sniffing.
    """
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://open.spotify.com *.spotify.com *.scdn.co *.spotifycdn.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://open.spotify.com *.spotify.com *.scdn.co; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://open.spotify.com *.spotify.com *.scdn.co; "
        "img-src 'self' data: *.scdn.co *.spotifycdn.com; "
        "frame-src 'self' https://open.spotify.com; "
        "media-src 'self' blob: *.scdn.co *.spotifycdn.com; "
        "worker-src 'self' blob:; "
        "connect-src 'self' *.spotify.com spclient.wg.spotify.com;"
    )
    response.headers['Content-Security-Policy'] = csp
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

# --- Constantes del sistema para actividad reciente ---
RECENT_ACTIVITY_DAYS_LIMIT = 1
RECENT_ACTIVITY_ITEMS_LIMIT = 15

# --- Configuración de conexión a la base de datos MySQL ---
db_config = {
    'host': 'localhost', 
    'user': 'root', # ejemplo de contraseña comun
    'password': '',
    'database': 'project_hub' #ejempplo de base de datos
}

# --- Función utilitaria para obtener una conexión a la base de datos ---
def get_db_connection():
    """Devuelve una conexión activa a la base de datos MySQL usando los parámetros configurados."""
    return mysql.connector.connect(**db_config)

# --- Rutas web principales (frontend HTML) ---

@app.route('/')
def root():
    """Ruta raíz que redirige al login (página principal del sistema)."""
    return redirect(url_for('login_page'))

@app.route('/dashboard')
def dashboard_page():
    """
    Renderiza la vista principal del dashboard si hay un usuario autenticado.
    De lo contrario, redirige al login.
    """
    if 'user_id' not in session:
        return redirect(url_for('login_page'))

    # Información del usuario tomada de la sesión para pasar a la plantilla
    user_info = {
        'first_name': session.get('first_name', 'Usuario'),
        'last_name': session.get('last_name', ''),
        'email': session.get('email', ''),
        'username': session.get('username', ''),
        'avatar_url': session.get('avatar_url'),
        'role': session.get('role')
    }
    return render_template('index.html', user=user_info)

@app.route('/login')
def login_page():
    """Muestra la plantilla HTML para el inicio de sesión."""
    return render_template('login.html')

@app.route('/register')
def register_page():
    """Muestra la plantilla HTML para el formulario de registro de usuarios."""
    return render_template('register.html')

@app.route('/forgot-password')
def forgot_password_page():
    """Renderiza la plantilla HTML para recuperación de contraseña."""
    return render_template('forgot_password.html')

@app.route('/reset-password/<token>')
def reset_password_page(token):
    """Renderiza la plantilla HTML para restablecimiento de contraseña usando un token."""
    return render_template('reset_password.html', token=token)

@app.route('/api/login', methods=['POST'])
def api_login():
    """
    API para iniciar sesión de usuario.
    Verifica las credenciales y crea una sesión de usuario si son válidas.
    También actualiza la contraseña si está en texto plano.
    """
    data = request.json
    email = data.get('email')
    password = data.get('password')

    # Validación de campos obligatorios
    if not email or not password:
        return jsonify({'error': 'Email y contraseña son requeridos'}), 400

    conn = None
    try:
        print(f"Intentando login para email: {email}")
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Buscar usuario por email
        cursor.execute("SELECT * FROM users WHERE Email = %s", (email,))
        user = cursor.fetchone()

        if not user:
            print(f"Usuario no encontrado para email: {email}")
            return jsonify({'error': 'Email o contraseña incorrectos'}), 401

        password_is_correct = False

        try:
            # Verificar si la contraseña ya está hasheada
            if bcrypt.check_password_hash(user['Password'], password):
                password_is_correct = True
        except ValueError:
            # Si falla, es posible que la contraseña esté sin hash (en texto plano)
            print(f"Posible contraseña en texto plano para el usuario {user['user_id']}. Verificando...")
            if user['Password'] == password:
                password_is_correct = True
                # Se actualiza la contraseña a formato hash
                print(f"Contraseña en texto plano correcta. Actualizando a hash para el usuario {user['user_id']}...")
                new_hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
                cursor.execute(
                    "UPDATE users SET Password = %s WHERE user_id = %s",
                    (new_hashed_password, user['user_id'])
                )
                conn.commit()
                print(f"Contraseña actualizada exitosamente para el usuario {user['user_id']}.")

        if password_is_correct:
            # Verifica si el usuario está bloqueado
            if user.get('is_blocked', 0):
                print("Usuario bloqueado")
                return jsonify({'error': 'Usuario bloqueado. Contacte al administrador.'}), 403

            # Crear sesión del lado del servidor
            session['user_id'] = user['user_id']
            session['username'] = user['username']
            session['first_name'] = user['first_name']
            session['last_name'] = user.get('last_name')
            session['email'] = user.get('Email')
            session['avatar_url'] = user.get('avatar_url')
            session['role'] = user.get('role')

            return jsonify({'message': 'Inicio de sesión exitoso'}), 200
        else:
            return jsonify({'error': 'Email o contraseña incorrectos'}), 401

    except Exception as err:
        print(f"Error en la API de login: {err}")
        return jsonify({'error': f'Error interno del servidor: {err}'}), 500

    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()
@app.route('/logout')
def logout():
    """
    Cierra la sesión del usuario actual.
    Elimina todos los datos almacenados en `session`.
    """
    session.clear()
    return redirect(url_for('login_page'))

# --- API para registro de nuevos usuarios ---
@app.route('/api/register', methods=['POST'])
def api_register():
    """
    API para registrar un nuevo usuario.
    - Verifica que todos los campos requeridos estén presentes.
    - Encripta la contraseña antes de almacenarla.
    """
    data = request.json
    required_fields = ['first_name', 'username', 'email', 'password']

    # Validación de campos obligatorios
    if not all(field in data and data[field] for field in required_fields):
        return jsonify({'error': 'Todos los campos requeridos no fueron proporcionados.'}), 400

    # Validación de longitud de contraseña
    if len(data['password']) < 8:
        return jsonify({'error': 'La contraseña debe tener al menos 8 caracteres.'}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Verificar duplicados de email o nombre de usuario
        cursor.execute("SELECT user_id FROM users WHERE Email = %s OR username = %s", (data['email'], data['username']))
        if cursor.fetchone():
            return jsonify({'error': 'El email o el nombre de usuario ya están en uso.'}), 409

        # Hashear la contraseña
        hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')

        # Insertar nuevo usuario
        cursor.execute("""
            INSERT INTO users (first_name, last_name, username, Email, Password, role, is_email_verified)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
        """, (
            data['first_name'],
            data.get('last_name', ''),
            data['username'],
            data['email'],
            hashed_password,
            'Colaborador'  # Rol por defecto
        ))
        conn.commit()

        return jsonify({'message': 'Registro exitoso. Ahora puedes iniciar sesión.'}), 201

    except mysql.connector.Error as err:
        print(f"Error durante el registro: {err}")
        return jsonify({'error': f'Error de base de datos: {err}'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Solicitud para restablecimiento de contraseña (sin envío de correo) ---
@app.route('/api/forgot-password', methods=['POST'])
def api_forgot_password():
    """
    API para generar un token de restablecimiento de contraseña.
    - Verifica si el email existe en la base de datos.
    - Genera un token aleatorio y almacena su expiración.
    - No envía correo, pero responde siempre igual para evitar filtrado de emails.
    """
    data = request.json
    email = data.get('email')

    if not email:
        return jsonify({'error': 'Email es requerido'}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Buscar usuario con ese email
        cursor.execute("SELECT user_id, Email FROM users WHERE Email = %s", (email,))
        user = cursor.fetchone()

        if user:
            token = secrets.token_urlsafe(32)  # Token seguro
            expiration = datetime.now() + timedelta(hours=1)  # Validez de 1 hora

            # Guardar token y fecha de expiración en la base de datos
            cursor.execute(
                "UPDATE users SET password_reset_token = %s, reset_token_expiration = %s WHERE user_id = %s",
                (token, expiration, user['user_id'])
            )
            conn.commit()
            # NOTA: El envío de correo fue removido intencionalmente

        # Respuesta genérica siempre, aunque el email no exista
        return jsonify({'message': 'Si existe una cuenta con ese email, se ha generado un enlace de restablecimiento.'}), 200

    except Exception as e:
        print(f"Error en forgot-password: {e}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Restablecimiento de contraseña usando el token ---
@app.route('/api/reset-password', methods=['POST'])
def api_reset_password():
    """
    API para restablecer la contraseña usando un token válido.
    - Verifica que el token exista y no haya expirado.
    - Hashea y actualiza la nueva contraseña.
    """
    data = request.json
    token = data.get('token')
    password = data.get('password')

    # Validación de campos
    if not token or not password:
        return jsonify({'error': 'Token y nueva contraseña son requeridos'}), 400

    if len(password) < 8:
        return jsonify({'error': 'La contraseña debe tener al menos 8 caracteres.'}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Buscar usuario con el token
        cursor.execute(
            "SELECT user_id, reset_token_expiration FROM users WHERE password_reset_token = %s",
            (token,)
        )
        user = cursor.fetchone()

        # Validación de token y expiración
        if not user or user['reset_token_expiration'] < datetime.now():
            return jsonify({'error': 'El enlace es inválido o ha expirado.'}), 400

        # Hashear nueva contraseña y limpiar el token
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        cursor.execute(
            "UPDATE users SET Password = %s, password_reset_token = NULL, reset_token_expiration = NULL WHERE user_id = %s",
            (hashed_password, user['user_id'])
        )
        conn.commit()

        return jsonify({'message': 'Contraseña actualizada exitosamente. Ahora puedes iniciar sesión.'}), 200

    except Exception as e:
        print(f"Error en reset-password: {e}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Resumen de análisis del dashboard ---
@app.route('/api/analytics/summary', methods=['GET'])
def get_analytics_summary():
    """
    Retorna un resumen de analítica para mostrar en el dashboard.
    Incluye:
    - Tareas completadas en la semana
    - Tiempo de enfoque (focus time)
    - Objetivos completados
    - Número de proyectos colaborativos
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    user_id = session['user_id']

    # Parámetros opcionales de fechas
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    date_filter_sql = ""
    date_params = []

    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d') + timedelta(days=1)
            date_filter_sql = " AND COALESCE(t.completed_at, t.due_date) BETWEEN %s AND %s"
            date_params = [start_date, end_date]
        except ValueError:
            return jsonify({'error': 'Formato de fecha inválido. Usar YYYY-MM-DD.'}), 400
    else:
        # Por defecto: últimos 7 días
        start_date = datetime.now() - timedelta(days=7)
        date_filter_sql = " AND COALESCE(t.completed_at, t.due_date) >= %s"
        date_params = [start_date]

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Tareas completadas
        query = f"""
            SELECT COUNT(*) 
            FROM tasks 
            WHERE assigned_to = %s 
              AND status = 'completada'
              {date_filter_sql.replace('t.completed_at', 'completed_at').replace('t.due_date', 'due_date')}
        """
        cursor.execute(query, (user_id, *date_params))
        completed_this_week = cursor.fetchone()[0]

        # 2. Productividad (aún no implementada, placeholder)
        productivity = 0

        # 3. Tiempo de enfoque (en minutos)
        cursor.execute("""
            SELECT COALESCE(SUM(duration_seconds), 0) 
            FROM focus_sessions 
            WHERE user_id = %s 
              AND start_time >= %s
              AND start_time < %s
              AND end_time IS NOT NULL
        """, (user_id, start_date, end_date if 'end_date' in locals() else datetime.now()))
        focus_seconds_this_week = cursor.fetchone()[0]
        focus_minutes_this_week = round(focus_seconds_this_week / 60)

        # 4. Objetivos completados esta semana
        cursor.execute("""
            SELECT COUNT(*) 
            FROM focus_objectives fo
            JOIN tasks t ON fo.task_id = t.task_id
            WHERE t.assigned_to = %s 
              AND fo.completed = 1
              AND fo.created_at >= %s AND fo.created_at < %s
        """, (user_id, start_date, end_date if 'end_date' in locals() else datetime.now()))
        objectives_completed_this_week = cursor.fetchone()[0]

        # 5. Número de proyectos colaborativos (más de un usuario asignado)
        cursor.execute("""
            SELECT COUNT(DISTINCT p.project_id)
            FROM projects p
            WHERE p.project_id IN (
                SELECT DISTINCT t.project_id 
                FROM tasks t 
                WHERE t.project_id IS NOT NULL
                GROUP BY t.project_id 
                HAVING COUNT(DISTINCT t.assigned_to) > 1
            )
        """)
        collaborative_projects_count = cursor.fetchone()[0]

        # Retorna el resumen
        return jsonify({
            'completedThisWeek': completed_this_week,
            'productivityChange': productivity,
            'focusMinutesThisWeek': focus_minutes_this_week,
            'objectivesCompletedThisWeek': objectives_completed_this_week,
            'collaborativeProjectsCount': collaborative_projects_count
        })

    except mysql.connector.Error as err:
        print(f"Error getting analytics summary: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- API Endpoints: Focus Sessions ---
@app.route('/api/focus/start_session', methods=['POST'])
def start_focus_session():
    """
    Inicia una nueva sesión de enfoque para una tarea específica.
    - Verifica que no exista ya una sesión activa.
    - Registra el `task_id` y la hora de inicio.
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    data = request.json
    task_id = data.get('task_id')

    if not task_id:
        return jsonify({'error': 'task_id es requerido'}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Verifica si ya hay una sesión activa
        cursor.execute("""
            SELECT session_id FROM focus_sessions 
            WHERE user_id = %s AND end_time IS NULL
        """, (session['user_id'],))
        active_session = cursor.fetchone()
        if active_session:
            return jsonify({'error': 'Ya hay una sesión activa'}), 400

        # Inicia la sesión
        start_time = datetime.now()
        cursor.execute("""
            INSERT INTO focus_sessions (user_id, task_id, start_time)
            VALUES (%s, %s, %s)
        """, (session['user_id'], task_id, start_time))
        conn.commit()
        session_id = cursor.lastrowid

        return jsonify({
            'session_id': session_id,
            'start_time': start_time.isoformat(),
            'message': 'Sesión de enfoque iniciada'
        }), 201

    except mysql.connector.Error as err:
        print(f"Error starting focus session: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

#finalizacion del modo eenfoque
@app.route('/api/focus/end_session', methods=['POST'])
def end_focus_session():
    """
    Finaliza la sesión de enfoque activa.
    - Registra la hora de fin y calcula la duración.
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Buscar sesión activa más reciente
        cursor.execute("""
            SELECT session_id, start_time FROM focus_sessions 
            WHERE user_id = %s AND end_time IS NULL
            ORDER BY start_time DESC LIMIT 1
        """, (session['user_id'],))
        active_session = cursor.fetchone()
        if not active_session:
            return jsonify({'error': 'No hay sesión activa'}), 400

        session_id, start_time = active_session
        end_time = datetime.now()
        duration_seconds = int((end_time - start_time).total_seconds())

        # Actualiza la sesión
        cursor.execute("""
            UPDATE focus_sessions 
            SET end_time = %s, duration_seconds = %s 
            WHERE session_id = %s
        """, (end_time, duration_seconds, session_id))
        conn.commit()

        return jsonify({
            'session_id': session_id,
            'duration_seconds': duration_seconds,
            'duration_minutes': round(duration_seconds / 60, 1),
            'message': 'Sesión de enfoque finalizada'
        }), 200

    except mysql.connector.Error as err:
        print(f"Error ending focus session: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/focus/active_session', methods=['GET'])
def get_active_session():
    """Checks for and returns the active focus session."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT session_id, task_id, start_time 
            FROM focus_sessions 
            WHERE user_id = %s AND end_time IS NULL
            ORDER BY start_time DESC LIMIT 1
        """, (session['user_id'],))
        
        active_session = cursor.fetchone()
        
        if active_session:
            # Convert datetime to ISO format string for JSON compatibility
            active_session['start_time'] = active_session['start_time'].isoformat()
            return jsonify(active_session), 200
        else:
            return jsonify(None), 200
            
    except mysql.connector.Error as err:
        print(f"Error checking for active session: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

#Obtener secion activa actual
@app.route('/api/focus/discard_session', methods=['POST'])
def discard_focus_session():
    """
    Ends an active/stuck focus session, ensuring the time is logged for analytics.
    Previously, this deleted the session, causing data loss. Now it properly ends it,
    which is crucial for accurate "Focus Time" statistics.
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Find the active session to end it, not delete it.
        cursor.execute("""
            SELECT session_id, start_time FROM focus_sessions 
            WHERE user_id = %s AND end_time IS NULL
            ORDER BY start_time DESC LIMIT 1
        """, (session['user_id'],))
        
        active_session = cursor.fetchone()
        
        if not active_session:
            return jsonify({'message': 'No se encontró ninguna sesión activa para descartar.'}), 200
        
        session_id, start_time = active_session
        end_time = datetime.now()
        duration_seconds = int((end_time - start_time).total_seconds())
        
        # Registra la sesión correctamente actualizando su hora de finalización y duración.
        cursor.execute("UPDATE focus_sessions SET end_time = %s, duration_seconds = %s WHERE session_id = %s", (end_time, duration_seconds, session_id))
        conn.commit()
        
        return jsonify({'message': 'La sesión activa ha sido finalizada y registrada.'}), 200
    except mysql.connector.Error as err:
        print(f"Error discarding focus session: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/focus/pause_session', methods=['POST'])
def pause_focus_session():
    """Pauses an active session (by ending it)."""
    return end_focus_session()

@app.route('/api/focus/sessions', methods=['GET'])
def get_focus_sessions():
    """Gets a list of a user's focus sessions."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    
    days = request.args.get('days', 7, type=int)
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        date_filter = datetime.now() - timedelta(days=days)
        
        cursor.execute("""
            SELECT 
                fs.session_id,
                fs.task_id,
                t.title AS task_title,
                fs.start_time,
                fs.end_time,
                fs.duration_seconds,
                ROUND(fs.duration_seconds / 60.0, 1) AS duration_minutes
            FROM focus_sessions fs
            LEFT JOIN tasks t ON fs.task_id = t.task_id
            WHERE fs.user_id = %s 
              AND fs.start_time >= %s
              AND fs.end_time IS NOT NULL
            ORDER BY fs.start_time DESC
        """, (session['user_id'], date_filter))
        
        sessions = cursor.fetchall()
        
        return jsonify(sessions), 200
        
    except mysql.connector.Error as err:
        print(f"Error getting focus sessions: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- API Endpoints: Focus Stats ---
@app.route('/api/focus/stats', methods=['GET'])
def get_focus_stats():
    """Gets detailed focus mode statistics for a user."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    
    user_id = session['user_id']
    days = request.args.get('days', 30, type=int)
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        date_filter = datetime.now() - timedelta(days=days)
        
        # 1. Total focus time (minutes)
        cursor.execute("""
            SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds
            FROM focus_sessions 
            WHERE user_id = %s 
              AND start_time >= %s
              AND end_time IS NOT NULL
        """, (user_id, date_filter))
        total_seconds = cursor.fetchone()['total_seconds']
        total_minutes = round(total_seconds / 60)
        
        # 2. Número de sesiones completadas
        cursor.execute("""
            SELECT COUNT(*) AS session_count
            FROM focus_sessions 
            WHERE user_id = %s 
              AND start_time >= %s
              AND end_time IS NOT NULL
        """, (user_id, date_filter))
        session_count = cursor.fetchone()['session_count']
        
        # 3. Duración media por sesión
        avg_duration = round(total_minutes / session_count) if session_count > 0 else 0
        
        # 4. Objetivos totales y cumplidos
        cursor.execute("""
            SELECT 
                COUNT(*) AS total_objectives,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_objectives
            FROM focus_objectives fo
            JOIN tasks t ON fo.task_id = t.task_id
            WHERE t.assigned_to = %s 
              AND fo.created_at >= %s
        """, (user_id, date_filter))
        objectives_data = cursor.fetchone()
        total_objectives = objectives_data['total_objectives']
        completed_objectives = objectives_data['completed_objectives']
        
        # 5. Tasa de finalización del objetivo
        completion_rate = round((completed_objectives / total_objectives) * 100) if total_objectives > 0 else 0
        
        # 6. Las 5 tareas más enfocadas
        cursor.execute("""
            SELECT 
                t.title AS task_title,
                COUNT(fs.session_id) AS session_count,
                COALESCE(SUM(fs.duration_seconds), 0) AS total_seconds,
                ROUND(COALESCE(SUM(fs.duration_seconds), 0) / 60.0, 1) AS total_minutes
            FROM focus_sessions fs
            JOIN tasks t ON fs.task_id = t.task_id
            WHERE fs.user_id = %s 
              AND fs.start_time >= %s
              AND fs.end_time IS NOT NULL
            GROUP BY fs.task_id, t.title
            ORDER BY total_seconds DESC
            LIMIT 5
        """, (user_id, date_filter))
        top_tasks = cursor.fetchall()
        
        # 7. Distribución del tiempo por día de la semana
        cursor.execute("""
            SELECT 
                DAYNAME(fs.start_time) AS day_name,
                COALESCE(SUM(fs.duration_seconds), 0) AS total_seconds,
                ROUND(COALESCE(SUM(fs.duration_seconds), 0) / 60.0, 1) AS total_minutes
            FROM focus_sessions fs
            WHERE fs.user_id = %s 
              AND fs.start_time >= %s
              AND fs.end_time IS NOT NULL
            GROUP BY DAYOFWEEK(fs.start_time), DAYNAME(fs.start_time)
            ORDER BY DAYOFWEEK(fs.start_time)
        """, (user_id, date_filter))
        daily_distribution = cursor.fetchall()
        
        return jsonify({
            'period_days': days,
            'total_focus_minutes': total_minutes,
            'total_sessions': session_count,
            'avg_session_duration': avg_duration,
            'total_objectives': total_objectives,
            'completed_objectives': completed_objectives,
            'objective_completion_rate': completion_rate,
            'top_focused_tasks': top_tasks,
            'daily_distribution': daily_distribution
        }), 200
        
    except mysql.connector.Error as err:
        print(f"Error getting focus stats: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Puntos finales de API: análisis e informes ---
@app.route('/api/analytics/project_assignments', methods=['GET'])
def get_project_assignments_distribution():
    """Calculates how many unique projects are assigned to each user."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    date_filter_sql = ""
    params = []

    if start_date_str and end_date_str:
        date_filter_sql = " AND t.created_at BETWEEN %s AND %s"
        params.extend([start_date_str, end_date_str])

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = f"""
            SELECT 
                u.username,
                COUNT(DISTINCT t.project_id) AS project_count
            FROM tasks t
            JOIN users u ON t.assigned_to = u.user_id
            WHERE t.project_id IS NOT NULL {date_filter_sql}
            GROUP BY u.user_id, u.username
            HAVING project_count > 0
            ORDER BY project_count DESC;"""
        cursor.execute(query, tuple(params))
        distribution_data = cursor.fetchall()
        return jsonify(distribution_data)
    except mysql.connector.Error as err:
        print(f"Error getting project assignments distribution: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/export/csv', methods=['GET'])
def export_data_as_csv():
    """
    Exports all tasks related to the logged-in user as a CSV file.
    This includes tasks assigned to the user and tasks created by the user.
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    user_id = session['user_id']

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Una consulta completa para obtener detalles de tareas y proyectos para exportar
        cursor.execute("""
            SELECT 
                t.task_id,
                t.title AS task_title,
                t.description,
                t.status,
                t.worseness AS priority,
                t.due_date,
                t.completed_at,
                t.created_at,
                p.title AS project_name,
                u_assigned.username AS assigned_to_user
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.project_id
            LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.user_id
            WHERE t.assigned_to = %s OR t.created_by = %s
            ORDER BY t.created_at DESC
        """, (user_id, user_id))
        
        tasks = cursor.fetchall()

        if not tasks:
            return jsonify({'message': 'No hay datos para exportar'}), 404

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(tasks[0].keys())
        for row in tasks:
            writer.writerow(row.values())

        output.seek(0)
        return Response(output, mimetype="text/csv", headers={"Content-Disposition": "attachment;filename=taskmanager_pro_export.csv"})
    except mysql.connector.Error as err:
        print(f"Error exporting data: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/tasks/completed_count', methods=['GET'])
def completed_tasks_count():
    """Returns the count of completed tasks for the logged-in user."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    user_id = session['user_id']
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE status = 'completada' AND assigned_to = %s", (user_id,))
        count = cursor.fetchone()[0]
        return jsonify({'completed_count': count})
    except Exception as e:
        print(f"Error getting completed tasks count: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Puntos finales de API: Tareas ---
@app.route('/tasks', methods=['GET'])
def get_tasks():
    """Gets all tasks assigned to the logged-in user, with optional week filter."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    user_id = session['user_id']

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    params = [user_id]
    filter_sql = ''
    if start_date and end_date:
        # Filtra por un rango de fechas de vencimiento
        # Esto es útil para las tarjetas KPI que muestran tareas pendientes o completadas en un rango.
        filter_sql = " AND t.due_date BETWEEN %s AND %s"
        params.extend([start_date, end_date])

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"""
            SELECT 
                t.task_id, 
                t.project_id, 
                p.title AS project_name,
                t.title AS task_title,
                t.description,
                t.status, 
                t.assigned_to,
                u.username AS assigned_username,
                t.due_date,
                t.worseness,
                t.completed_at, 
                t.created_at, 
                t.created_by
            FROM tasks t
            LEFT JOIN users u ON t.assigned_to = u.user_id
            LEFT JOIN projects p ON t.project_id = p.project_id
            WHERE t.assigned_to = %s{filter_sql}
            ORDER BY t.due_date ASC
        """, tuple(params))
        tasks = cursor.fetchall()
        return jsonify(tasks)
    except mysql.connector.Error as err:
        print(f"Error getting tasks: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/tasks', methods=['POST'])
def create_task():
    """Creates a new task."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para crear tareas'}), 403

    data = request.json
    if not data.get('title') or not data.get('assigned_to'):
        return jsonify({'error': 'Título y usuario asignado son requeridos'}), 400
    
    completed_at = datetime.now() if data.get('status') == 'completada' else None
    created_at = datetime.now()
    created_by = session['user_id']

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            INSERT INTO tasks (
                project_id, title, description, status, assigned_to, 
                due_date, worseness, created_by, created_at, completed_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data.get('project_id'), data.get('title'), data.get('description'),
            data.get('status', 'pendiente'), data.get('assigned_to'), 
            data.get('due_date'), data.get('worseness', 'Baja'),
            created_by, created_at, completed_at
        ))
        conn.commit()
        task_id = cursor.lastrowid
        
        # Obtener la tarea recién creada para devolver un objeto completo
        cursor.execute("""
            SELECT 
                t.task_id, 
                t.project_id, 
                p.title AS project_name,
                t.title AS task_title,
                t.description,
                t.status, 
                t.assigned_to,
                u.username AS assigned_username,
                t.due_date,
                t.worseness,
                t.completed_at, 
                t.created_at, 
                t.created_by
            FROM tasks t
            LEFT JOIN users u ON t.assigned_to = u.user_id
            LEFT JOIN projects p ON t.project_id = p.project_id
            WHERE t.task_id = %s
        """, (task_id,))
        new_task = cursor.fetchone()
        return jsonify(new_task), 201
    except mysql.connector.Error as err:
        print(f"Error creating task: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    """Gets a specific task by its ID."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT 
                t.task_id, 
                t.project_id, 
                p.title AS project_name,
                t.title AS task_title,
                t.description, 
                t.status, 
                t.assigned_to,
                u.username AS assigned_username,
                t.due_date,
                t.worseness,
                t.completed_at, 
                t.created_at, 
                t.created_by
            FROM tasks t
            LEFT JOIN users u ON t.assigned_to = u.user_id
            LEFT JOIN projects p ON t.project_id = p.project_id
            WHERE t.task_id = %s
        """, (task_id,))
        task = cursor.fetchone()
        if task:
            return jsonify(task)
        else:
            return jsonify({'error': 'Tarea no encontrada'}), 404
    except mysql.connector.Error as err:
        print(f"Error getting task by ID: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """Updates a specific task."""
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para modificar tareas'}), 403

    data = request.json
    if not data:
        return jsonify({'error': 'No se proporcionaron datos para actualizar'}), 400

    update_fields = []
    update_values = []
    
    allowed_fields = ['title', 'description', 'status', 'assigned_to', 'due_date', 'project_id', 'worseness']

    for field in allowed_fields:
        if field in data:
            update_fields.append(f"{field} = %s")
            update_values.append(data[field] if data[field] != '' else None)

    if 'status' in data:
        if data['status'] == 'completada':
            update_fields.append("completed_at = %s")
            update_values.append(datetime.now())

    if not update_fields:
        return jsonify({'error': 'No se proporcionaron campos válidos para actualizar'}), 400

    update_query = f"UPDATE tasks SET {', '.join(update_fields)} WHERE task_id = %s"
    update_values.append(task_id)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(update_query, tuple(update_values))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Tarea no encontrada o no se realizaron cambios'}), 404
        return jsonify({'message': 'Tarea actualizada correctamente'})
    except mysql.connector.Error as err:
        print(f"Error updating task: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Deletes a task by its ID."""
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para eliminar tareas'}), 403

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tasks WHERE task_id = %s", (task_id,))
        if cursor.rowcount == 0:
            return jsonify({'error': 'Tarea no encontrada'}), 404
        conn.commit()
        return jsonify({'message': 'Tarea eliminada correctamente'})
    except mysql.connector.Error as err:
        if conn:
            conn.rollback()
        print(f"Error deleting task: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()


# ---Puntos finales de API: Proyectos ---
@app.route('/projects', methods=['GET'])
def get_projects():
    """Gets all projects with a task count."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    filter_sql = ""
    params = []
    if start_date and end_date:
        filter_sql = " WHERE p.created_at BETWEEN %s AND %s"
        params.extend([start_date, end_date])

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = f"""
            SELECT p.project_id, p.title AS project_name, p.description, p.created_by, p.created_at, p.status,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.project_id) AS task_count
            FROM projects p
            {filter_sql}
        """
        cursor.execute(query, tuple(params))
        projects = cursor.fetchall()
        return jsonify(projects)
    except mysql.connector.Error as err:
        print(f"Error getting projects: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/projects/<int:project_id>', methods=['PUT'])
def update_project_status(project_id):
    """Updates a project's status or other fields."""
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para modificar proyectos'}), 403

    data = request.json
    fields = []
    values = []
    if 'title' in data:
        fields.append('title = %s')
        values.append(data['title'])
    if 'description' in data:
        fields.append('description = %s')
        values.append(data['description'])
    if 'status' in data:
        fields.append('status = %s')
        values.append(data['status'])
    if not fields:
        return jsonify({'error': 'No se proporcionaron campos para actualizar'}), 400
    values.append(project_id)
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(f"UPDATE projects SET {', '.join(fields)} WHERE project_id = %s", tuple(values))
        conn.commit()
        return jsonify({'message': 'Proyecto actualizado correctamente'})
    except mysql.connector.Error as err:
        print(f"Error updating project: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    """
    Deletes a project and all its associated tasks and focus data.
    This operation is performed as a transaction.
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para eliminar proyectos'}), 403

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        conn.start_transaction()

        cursor.execute("SELECT task_id FROM tasks WHERE project_id = %s", (project_id,))
        task_ids_tuples = cursor.fetchall()
        task_ids = [item[0] for item in task_ids_tuples]

        if task_ids:
            placeholders = ', '.join(['%s'] * len(task_ids))
            cursor.execute(f"DELETE FROM focus_objectives WHERE task_id IN ({placeholders})", tuple(task_ids))
            cursor.execute(f"DELETE FROM focus_sessions WHERE task_id IN ({placeholders})", tuple(task_ids))

        cursor.execute("DELETE FROM tasks WHERE project_id = %s", (project_id,))
        cursor.execute("DELETE FROM projects WHERE project_id = %s", (project_id,))
        
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'error': 'Proyecto no encontrado'}), 404

        conn.commit()
        return jsonify({'message': 'Proyecto y sus dependencias eliminados correctamente'})

    except mysql.connector.Error as err:
        if conn:
            conn.rollback()
        print(f"Error deleting project: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/projects/<int:project_id>', methods=['GET'])
def get_project(project_id):
    """Gets a specific project by its ID."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        # El código JS espera 'título', 'descripción', 'created_at' y 'estado'.
        cursor.execute("""
            SELECT project_id, title, description, created_at, status
            FROM projects
            WHERE project_id = %s
        """, (project_id,))
        project = cursor.fetchone()
        if project:
            return jsonify(project)
        else:
            return jsonify({'error': 'Proyecto no encontrado'}), 404
    except mysql.connector.Error as err:
        print(f"Error al obtener el proyecto por ID: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/projects', methods=['POST'])
def create_project():
    """Creates a new project."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para crear proyectos'}), 403

    data = request.json
    if not data.get('title'):
        return jsonify({'error': 'El título del proyecto es obligatorio'}), 400
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        created_by = session['user_id']
        created_at = datetime.now()
        cursor.execute("""
            INSERT INTO projects (title, description, created_by, created_at)
            VALUES (%s, %s, %s, %s)
        """, (data['title'], data.get('description', ''), created_by, created_at))
        conn.commit()
        project_id = cursor.lastrowid
        
        cursor.execute("SELECT project_id, title AS project_name, description, created_by, created_at FROM projects WHERE project_id = %s", (project_id,))
        new_project = cursor.fetchone()
        return jsonify(new_project), 201
    except mysql.connector.Error as err:
        print(f"Error creating project: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Puntos finales de la API: colaboradoras (usuarios
@app.route('/api/collaborators', methods=['GET'])
def get_collaborators():
    """Gets a list of all users/collaborators with their stats."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT
                u.user_id,
                u.username,
                u.first_name,
                u.last_name,
                u.Email,
                u.role,
                u.avatar_url,
                u.is_blocked,
                (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.user_id) AS assigned_tasks_count,
                (SELECT COUNT(DISTINCT project_id) FROM tasks WHERE assigned_to = u.user_id AND project_id IS NOT NULL) AS involved_projects_count
            FROM users u
            ORDER BY u.first_name, u.last_name;
        """)
        collaborators = cursor.fetchall()
        return jsonify(collaborators)
    except mysql.connector.Error as err:
        print(f"Error getting collaborators: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/users/<int:user_id>/details', methods=['GET'])
def get_user_details(user_id):
    """Gets detailed information and stats for a specific user."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT user_id, username, first_name, last_name, Email, 
                   role, 
                   avatar_url
            FROM users WHERE user_id = %s
        """, (user_id,))
        
        user_details = cursor.fetchone()

        if not user_details:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        cursor.execute("""
            SELECT 
                (SELECT COUNT(*) FROM tasks WHERE assigned_to = %s) AS assigned_tasks_count,
                (SELECT COUNT(DISTINCT project_id) FROM tasks WHERE assigned_to = %s AND project_id IS NOT NULL) AS involved_projects_count
        """, (user_id, user_id))
        stats = cursor.fetchone()
        user_details.update(stats)

        cursor.execute("""
            SELECT task_id, title AS task_title, due_date, status
            FROM tasks
            WHERE assigned_to = %s AND status <> 'completada'
            ORDER BY due_date ASC
            LIMIT 5;
        """, (user_id,))
        user_details['active_tasks'] = cursor.fetchall()
        
        return jsonify(user_details)

    except mysql.connector.Error as err:
        print(f"Error getting user details: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/users/<int:user_id>/role', methods=['PUT'])
def update_user_role(user_id):
    """
    Updates the role of a specific user.
    This action is restricted to administrators.
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') != 'Administrador':
        return jsonify({'error': 'No tienes permiso para realizar esta acción'}), 403

    data = request.json
    new_role = data.get('role')

    if not new_role:
        return jsonify({'error': 'Se requiere un nuevo rol'}), 400

    # Comprobación de seguridad: evitar que un administrador cambie su propio rol si es el último.
    if user_id == session['user_id']:
        conn_check = get_db_connection()
        cursor_check = conn_check.cursor()
        cursor_check.execute("SELECT COUNT(*) FROM users WHERE role = 'Administrador' AND user_id != %s", (user_id,))
        admin_count = cursor_check.fetchone()[0]
        cursor_check.close()
        conn_check.close()
        if admin_count == 0:
            return jsonify({'error': 'No puedes cambiar tu propio rol si eres el único administrador.'}), 403

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET role = %s WHERE user_id = %s", (new_role, user_id))
        conn.commit()
        return jsonify({'message': 'Rol del usuario actualizado correctamente'}), 200
    except mysql.connector.Error as err:
        return jsonify({'error': f'Error de base de datos: {err}'}), 500

# -Puntos finales de API: Bloquear/desbloquear y eliminar usuarios (solo administrador) -
@app.route('/api/users/<int:user_id>/block', methods=['PUT'])
def block_unblock_user(user_id):
    """
    Allows an admin to block or unblock a user.
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') != 'Administrador':
        return jsonify({'error': 'No tienes permiso para realizar esta acción'}), 403
    if user_id == session['user_id']:
        return jsonify({'error': 'No puedes bloquearte a ti mismo.'}), 403

    data = request.json
    is_blocked = data.get('is_blocked')
    if is_blocked is None:
        return jsonify({'error': 'Se requiere el campo is_blocked'}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_blocked = %s WHERE user_id = %s", (int(bool(is_blocked)), user_id))
        conn.commit()
        return jsonify({'message': 'Estado de bloqueo actualizado correctamente'}), 200
    except mysql.connector.Error as err:
        return jsonify({'error': f'Error de base de datos: {err}'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    """
    Allows an admin to delete a user (except themselves).
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') != 'Administrador':
        return jsonify({'error': 'No tienes permiso para realizar esta acción'}), 403
    if user_id == session['user_id']:
        return jsonify({'error': 'No puedes eliminarte a ti mismo.'}), 403

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
        if cursor.rowcount == 0:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        conn.commit()
        return jsonify({'message': 'Usuario eliminado correctamente'}), 200
    except mysql.connector.Error as err:
        return jsonify({'error': f'Error de base de datos: {err}'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Puntos finales de API: Recursos ---
@app.route('/api/resources', methods=['GET'])
def get_resources():
    """Gets a list of resources for the logged-in user."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    user_id = session['user_id']
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM resources WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        resources = cursor.fetchall()
        return jsonify(resources)
    except mysql.connector.Error as err:
        print(f"Error getting resources: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/resources', methods=['POST'])
def create_resource():
    """Creates a new resource, handling file uploads if needed."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para crear recursos'}), 403
    user_id = session['user_id']
    
    title = request.form.get('title')
    resource_type = request.form.get('type')
    final_url_or_path = request.form.get('url_or_path')

    if resource_type in ['document', 'image'] and 'resourceFile' in request.files:
        file = request.files['resourceFile']
        if file and file.filename != '':
            filename = secure_filename(file.filename)
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            final_url_or_path = url_for('uploaded_file', filename=filename, _external=True)

    if not title or not final_url_or_path:
        return jsonify({'error': 'Título y un Archivo/URL son requeridos'}), 400
        
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            INSERT INTO resources (user_id, title, description, type, url_or_path, category)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (user_id, title, request.form.get('description'), resource_type, final_url_or_path, request.form.get('category')))
        conn.commit()
        resource_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM resources WHERE resource_id = %s", (resource_id,))
        new_resource = cursor.fetchone()
        return jsonify(new_resource), 201
    except mysql.connector.Error as err:
        print(f"Error creating resource: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/resources/<int:resource_id>', methods=['DELETE'])
def delete_resource(resource_id):
    """Deletes a resource and its associated file if it's a local upload."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para eliminar recursos'}), 403
    user_id = session['user_id']

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT type, url_or_path FROM resources WHERE resource_id = %s AND user_id = %s", (resource_id, user_id))
        resource = cursor.fetchone()

        if not resource:
            return jsonify({'error': 'Recurso no encontrado o sin permiso'}), 404

        if resource['type'] in ['document', 'image']:
            try:
                filename = os.path.basename(resource['url_or_path'])
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception as e:
                print(f"Warning: Could not delete physical file {resource['url_or_path']}: {e}")

        cursor.execute("DELETE FROM resources WHERE resource_id = %s AND user_id = %s", (resource_id, user_id))
        conn.commit()
        return jsonify({'message': 'Recurso eliminado correctamente'}), 200
    except mysql.connector.Error as err:
        print(f"Error deleting resource: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    """Serves uploaded files from the 'uploads' directory."""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# --- Puntos finales de API: Avatar de usuario ---
@app.route('/api/user/avatar', methods=['POST'])
def upload_avatar():
    """Handles the upload and update of a user's avatar."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    user_id = session['user_id']

    if 'avatar' not in request.files:
        return jsonify({'error': 'No se encontró el archivo del avatar'}), 400

    file = request.files['avatar']

    if file.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo'}), 400

    if file:
        filename = secure_filename(f"user_{user_id}_{file.filename}")
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        avatar_url = url_for('uploaded_file', filename=filename, _external=True)

        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET avatar_url = %s WHERE user_id = %s", (avatar_url, user_id))
            conn.commit()
            session['avatar_url'] = avatar_url
            return jsonify({'message': 'Avatar actualizado correctamente', 'avatar_url': avatar_url}), 200
        except mysql.connector.Error as err:
            print(f"Error updating avatar in DB: {err}")
            return jsonify({'error': str(err)}), 500
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()

# --- Puntos finales de API: Usuarios (para selectores) ---
@app.route('/users', methods=['GET'])
def get_users():
    """Gets a list of all users for assignment purposes."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT user_id, username, first_name, last_name FROM users")
        users = cursor.fetchall()
        return jsonify(users)
    except mysql.connector.Error as err:
        print(f"Error getting users: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ---Puntos finales de API: objetivos de enfoque ---
@app.route('/focus_objectives/<int:task_id>', methods=['GET'])
def get_focus_objectives(task_id):
    """Gets all focus objectives for a specific task."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM focus_objectives WHERE task_id = %s ORDER BY created_at ASC", (task_id,))
        objectives = cursor.fetchall()
        return jsonify(objectives)
    except mysql.connector.Error as err:
        print(f"Error getting focus objectives: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/focus_objectives', methods=['POST'])
def add_focus_objective():
    """Adds a new focus objective to a task."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para añadir objetivos'}), 403

    data = request.json
    task_id = data.get('task_id')
    objective_text = data.get('objective_text')
    if not task_id or not objective_text:
        return jsonify({'error': 'task_id y objective_text son requeridos'}), 400
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            INSERT INTO focus_objectives (task_id, objective_text)
            VALUES (%s, %s)
        """, (task_id, objective_text))
        conn.commit()
        objective_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM focus_objectives WHERE objective_id = %s", (objective_id,))
        new_obj = cursor.fetchone()
        return jsonify(new_obj), 201
    except mysql.connector.Error as err:
        print(f"Error adding focus objective: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/focus_objectives/<int:objective_id>', methods=['PUT'])
def update_focus_objective(objective_id):
    """Updates the completion status of a focus objective."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para modificar objetivos'}), 403

    data = request.json
    completed = data.get('completed')
    if completed is None:
        return jsonify({'error': 'El campo completed es requerido'}), 400
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE focus_objectives SET completed = %s WHERE objective_id = %s", (completed, objective_id))
        conn.commit()
        return jsonify({'message': 'Objetivo actualizado'})
    except mysql.connector.Error as err:
        print(f"Error updating focus objective: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/focus_objectives/<int:objective_id>', methods=['DELETE'])
def delete_focus_objective(objective_id):
    """Deletes a focus objective by its ID."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para eliminar objetivos'}), 403

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM focus_objectives WHERE objective_id = %s", (objective_id,))
        conn.commit()
        return jsonify({'message': 'Objetivo eliminado'})
    except mysql.connector.Error as err:
        print(f"Error deleting focus objective: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Puntos finales de API: Actividad reciente ---
@app.route('/api/activity/recent', methods=['GET'])
def get_recent_activity():
    """Generates a combined feed of recent user and project activity."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    
    limit_date = datetime.now() - timedelta(days=RECENT_ACTIVITY_DAYS_LIMIT)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT * FROM (
                (
                    SELECT 
                        'project_created' AS activity_type,
                        p.title AS primary_subject,
                        NULL AS secondary_subject,
                        COALESCE(u.username, 'Sistema') AS actor_username,
                        p.created_at AS timestamp
                    FROM projects p
                    LEFT JOIN users u ON p.created_by = u.user_id
                    WHERE p.created_at >= %s
                )
                UNION ALL
                (
                    SELECT 
                        'task_completed' AS activity_type,
                        t.title AS primary_subject,
                        p.title AS secondary_subject,
                        COALESCE(u_assigned.username, 'Sistema') AS actor_username,
                        t.completed_at AS timestamp
                    FROM tasks t
                    LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.user_id
                    LEFT JOIN projects p ON t.project_id = p.project_id
                    WHERE t.status = 'completada' AND t.completed_at IS NOT NULL AND t.completed_at >= %s
                )
                UNION ALL
                (
                    SELECT 
                        'task_created' AS activity_type,
                        t.title AS primary_subject,
                        p.title AS secondary_subject,
                        COALESCE(u_creator.username, 'Sistema') AS actor_username,
                        t.created_at AS timestamp
                    FROM tasks t
                    LEFT JOIN users u_creator ON t.created_by = u_creator.user_id
                    LEFT JOIN projects p ON t.project_id = p.project_id
                    WHERE t.created_at IS NOT NULL AND t.created_at >= %s
                )
            ) AS recent_activities
            ORDER BY timestamp DESC
            LIMIT %s;
        """
        
        cursor.execute(query, (limit_date, limit_date, limit_date, RECENT_ACTIVITY_ITEMS_LIMIT))
        activities = cursor.fetchall()
        
        return jsonify(activities)
    except mysql.connector.Error as err:
        print(f"Error getting recent activity: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Puntos finales de API: Notas ---
@app.route('/api/notes', methods=['GET'])
def get_notes():
    """Gets a user's notes, with an option to filter for pinned notes."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    user_id = session['user_id']
    
    pinned_only = request.args.get('pinned', 'false').lower() == 'true'
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        query = "SELECT note_id, content, is_pinned, created_at, updated_at FROM notes WHERE user_id = %s"
        params = [user_id]
        
        if pinned_only:
            query += " AND is_pinned = TRUE"
            
        query += " ORDER BY updated_at DESC"
        
        cursor.execute(query, tuple(params))
        notes = cursor.fetchall()
        
        return jsonify(notes)
    except mysql.connector.Error as err:
        print(f"Error getting notes: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/notes', methods=['POST'])
def create_note():
    """Creates a new note."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para crear notas'}), 403
    user_id = session['user_id']
    
    data = request.json
    content = data.get('content')
    is_pinned = data.get('is_pinned', True)

    if not content:
        return jsonify({'error': 'El contenido de la nota es requerido'}), 400
        
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "INSERT INTO notes (user_id, content, is_pinned) VALUES (%s, %s, %s)",
            (user_id, content, is_pinned)
        )
        conn.commit()
        note_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM notes WHERE note_id = %s", (note_id,))
        new_note = cursor.fetchone()
        
        return jsonify(new_note), 201
    except mysql.connector.Error as err:
        print(f"Error creating note: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/notes/<int:note_id>', methods=['PUT'])
def update_note(note_id):
    """Updates a note's content or pinned status."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para modificar notas'}), 403
    user_id = session['user_id']
    
    data = request.json
    fields_to_update = []
    values = []
    
    if 'content' in data:
        fields_to_update.append("content = %s")
        values.append(data['content'])
    
    if 'is_pinned' in data:
        fields_to_update.append("is_pinned = %s")
        values.append(bool(data['is_pinned']))
        
    if not fields_to_update:
        return jsonify({'error': 'No se proporcionaron campos para actualizar'}), 400
        
    values.extend([note_id, user_id])
    
    query = f"UPDATE notes SET {', '.join(fields_to_update)} WHERE note_id = %s AND user_id = %s"
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(query, tuple(values))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Nota no encontrada o sin permiso para actualizar'}), 404
            
        return jsonify({'message': 'Nota actualizada correctamente'}), 200
    except mysql.connector.Error as err:
        print(f"Error updating note: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    """Deletes a note by its ID."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') == 'Invitado':
        return jsonify({'error': 'No tienes permiso para eliminar notas'}), 403
    user_id = session['user_id']
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM notes WHERE note_id = %s AND user_id = %s", (note_id, user_id))
        conn.commit()
        return jsonify({'message': 'Nota eliminada correctamente'}), 200
    except mysql.connector.Error as err:
        print(f"Error deleting note: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Puntos finales de API: Búsqueda global ---

@app.route('/api/search', methods=['GET'])
def global_search():
    """
    Búsqueda global que busca en tareas, proyectos y notas del usuario autenticado.
    Parámetros:
    - q: término de búsqueda (requerido)
    - type: tipo de contenido a buscar ('tasks', 'projects', 'notes', 'all') - por defecto 'all'
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    
    user_id = session['user_id']
    search_term = request.args.get('q', '').strip()
    search_type = request.args.get('type', 'all').lower()
    
    if not search_term:
        return jsonify({'error': 'Término de búsqueda requerido'}), 400
    
    if len(search_term) < 2:
        return jsonify({'error': 'El término de búsqueda debe tener al menos 2 caracteres'}), 400
    
    # Preparar el término para búsqueda con LIKE
    search_pattern = f"%{search_term}%"
    
    results = {
        'query': search_term,
        'tasks': [],
        'projects': [],
        'notes': []
    }
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Buscar en tareas (si el usuario es el asignado o creador)
        if search_type in ['all', 'tasks']:
            cursor.execute("""
                SELECT 
                    t.task_id,
                    t.title AS task_title,
                    t.description,
                    t.status,
                    t.worseness AS priority,
                    t.due_date,
                    t.created_at,
                    p.title AS project_name,
                    u.username AS assigned_to_username
                FROM tasks t
                LEFT JOIN projects p ON t.project_id = p.project_id
                LEFT JOIN users u ON t.assigned_to = u.user_id
                WHERE (t.assigned_to = %s OR t.created_by = %s)
                  AND (t.title LIKE %s OR t.description LIKE %s)
                ORDER BY t.created_at DESC
                LIMIT 20
            """, (user_id, user_id, search_pattern, search_pattern))
            results['tasks'] = cursor.fetchall()
        
        # Buscar en proyectos (todos los proyectos visibles para el usuario)
        if search_type in ['all', 'projects']:
            cursor.execute("""
                SELECT 
                    p.project_id,
                    p.title AS project_name,
                    p.description,
                    p.status,
                    p.created_at,
                    u.username AS created_by_username,
                    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.project_id) AS task_count
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.user_id
                WHERE p.title LIKE %s OR p.description LIKE %s
                ORDER BY p.created_at DESC
                LIMIT 20
            """, (search_pattern, search_pattern))
            results['projects'] = cursor.fetchall()
        
        # Buscar en notas (solo las del usuario autenticado)
        if search_type in ['all', 'notes']:
            cursor.execute("""
                SELECT 
                    note_id,
                    content,
                    is_pinned,
                    created_at,
                    updated_at
                FROM notes
                WHERE user_id = %s AND content LIKE %s
                ORDER BY updated_at DESC
                LIMIT 20
            """, (user_id, search_pattern))
            results['notes'] = cursor.fetchall()
        
        # Calcular totales
        results['total_results'] = len(results['tasks']) + len(results['projects']) + len(results['notes'])
        
        return jsonify(results)
        
    except mysql.connector.Error as err:
        print(f"Error en búsqueda global: {err}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# --- Puntos finales de API: Gestión de roles ---

@app.route('/api/roles', methods=['GET'])
def get_roles():
    """Gets a distinct list of all roles in the system."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') != 'Administrador':
        return jsonify({'error': 'No tienes permiso para ver los roles.'}), 403
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Select distinct, non-null, and non-empty roles
        cursor.execute("SELECT DISTINCT role FROM users WHERE role IS NOT NULL AND role != '' ORDER BY role")
        roles = [item[0] for item in cursor.fetchall()]
        return jsonify(roles)
    except mysql.connector.Error as err:
        print(f"Error getting roles: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/roles/update', methods=['PUT'])
def update_role_name():
    """Updates a role name for all users who have it."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') != 'Administrador':
        return jsonify({'error': 'No tienes permiso para realizar esta acción'}), 403
    
    data = request.json
    old_name = data.get('old_name')
    new_name = data.get('new_name')

    if not old_name or not new_name:
        return jsonify({'error': 'Se requieren el nombre antiguo y el nuevo nombre del rol'}), 400
    
    if old_name == new_name:
        return jsonify({'message': 'Los nombres son iguales, no se realizaron cambios.'}), 200

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET role = %s WHERE role = %s", (new_name, old_name))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'message': f'No se encontraron usuarios con el rol "{old_name}". No se realizaron cambios.'}), 200
            
        return jsonify({'message': f'Rol "{old_name}" actualizado a "{new_name}" para {cursor.rowcount} usuario(s).'}), 200
    except mysql.connector.Error as err:
        print(f"Error updating role name: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/roles/delete', methods=['DELETE'])
def delete_role():
    """Deletes a role by reassigning its users to a default role."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') != 'Administrador':
        return jsonify({'error': 'No tienes permiso para realizar esta acción'}), 403
        
    data = request.json
    role_to_delete = data.get('role_name')
    default_role = 'Colaborador' # El rol que se asignará a los usuarios del rol eliminado

    if not role_to_delete:
        return jsonify({'error': 'Se requiere el nombre del rol a eliminar'}), 400
        
    if role_to_delete.lower() == default_role.lower():
        return jsonify({'error': f'No se puede eliminar el rol por defecto "{default_role}".'}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET role = %s WHERE role = %s", (default_role, role_to_delete))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'message': f'No se encontraron usuarios con el rol "{role_to_delete}". No se realizaron cambios.'}), 200
            
        return jsonify({'message': f'Rol "{role_to_delete}" eliminado. {cursor.rowcount} usuario(s) fueron reasignados al rol "{default_role}".'}), 200
    except mysql.connector.Error as err:
        print(f"Error deleting role: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/users/create', methods=['POST'])
def create_user():
    """
    Permite a un administrador crear un nuevo usuario.
    """
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    if session.get('role') != 'Administrador':
        return jsonify({'error': 'No tienes permiso para realizar esta acción'}), 403

    data = request.json
    required_fields = ['first_name', 'username', 'email', 'password', 'role']
    if not all(field in data and data[field] for field in required_fields):
        return jsonify({'error': 'Todos los campos son requeridos'}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Verificar si el email o username ya existen
        cursor.execute("SELECT user_id FROM users WHERE Email = %s OR username = %s", (data['email'], data['username']))
        if cursor.fetchone():
            return jsonify({'error': 'El email o el nombre de usuario ya están en uso.'}), 409

        # Haz un hash de la contraseña antes de almacenarla
        hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        
        cursor.execute("""
            INSERT INTO users (first_name, last_name, username, Email, Password, role, is_email_verified)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            data['first_name'],
            data.get('last_name') or '', # Acepta tanto None como ''
            data['username'],
            data['email'],
            hashed_password,
            data['role'],
            True  # Los usuarios creados por un admin se verifican automáticamente
        ))
        conn.commit()
        user_id = cursor.lastrowid

        # Devolver el nuevo usuario creado (sin la contraseña)
        cursor.execute("""
            SELECT user_id, username, first_name, last_name, Email, role, avatar_url, is_blocked
            FROM users WHERE user_id = %s
        """, (user_id,))
        new_user = cursor.fetchone()

        return jsonify({'message': 'Usuario creado exitosamente', 'user': new_user}), 201

    except mysql.connector.Error as err:
        print(f"Error creating user: {err}")
        return jsonify({'error': f'Error de base de datos: {err}'}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == '__main__':
    app.run(debug=True)
