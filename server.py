#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CloWord — облачный текстовый редактор.

Сервер написан только на стандартной библиотеке Python 3.9+ (ничего устанавливать не нужно):
  * регистрация / вход / сессии (cookie HttpOnly, пароли PBKDF2-SHA256);
  * личный кабинет и хранение документов в SQLite;
  * корзина, избранное, история версий, защита от перезаписи с другого устройства;
  * раздача фронтенда из папки static/.

Запуск:  python server.py          (порт 8000, слушает все сетевые интерфейсы)
Переменные окружения: PORT, HOST, CLOWORD_DATA (папка с базой), COOKIE_SECURE=1 (за HTTPS).
"""
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
import traceback
from contextlib import closing
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.realpath(os.path.join(BASE_DIR, 'static'))
DATA_DIR = os.environ.get('CLOWORD_DATA', os.path.join(BASE_DIR, 'data'))
DB_PATH = os.path.join(DATA_DIR, 'cloword.db')
HOST = os.environ.get('HOST', '0.0.0.0')
PORT = int(os.environ.get('PORT', '8000'))
COOKIE_SECURE = os.environ.get('COOKIE_SECURE') == '1'

MAX_BODY = 50 * 1024 * 1024          # максимальный размер документа (с картинками)
SESSION_TTL = 60 * 60 * 24 * 30      # 30 дней
PBKDF2_ROUNDS = 260_000
VERSION_EVERY = 5 * 60               # снимок версии не чаще раза в 5 минут
VERSIONS_KEEP = 60
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
DOC_ID = r'([A-Za-z0-9_-]{8,40})'

PAGES = {'/': 'index.html', '/app': 'app.html', '/editor': 'editor.html'}
MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg',
    '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2',
}
CSP = ("default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https: http:; "
       "connect-src 'self' data: blob:; media-src 'self' data: blob:; object-src 'none'; "
       "base-uri 'self'; frame-ancestors 'none'; form-action 'self'")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  pass_hash TEXT NOT NULL, salt TEXT NOT NULL, prefs TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires REAL NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS documents(
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}', preview TEXT NOT NULL DEFAULT '', words INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0, deleted REAL, created REAL NOT NULL, updated REAL NOT NULL);
CREATE INDEX IF NOT EXISTS idx_docs_user ON documents(user_id, updated);
CREATE TABLE IF NOT EXISTS versions(
  id INTEGER PRIMARY KEY, doc_id TEXT NOT NULL, title TEXT, content TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}', words INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS idx_versions_doc ON versions(doc_id, created);
"""

WELCOME_DOC = """<p class="cw-title">Добро пожаловать в CloWord</p>
<p class="cw-subtitle">Ваш текстовый редактор в облаке — на компьютере, планшете и телефоне</p>
<h1>С чего начать</h1>
<p>Этот документ можно редактировать, как и любой другой. Все изменения <b>сохраняются автоматически</b> в вашем личном кабинете — откройте CloWord на другом устройстве, войдите в аккаунт, и документ будет там.</p>
<h2>Что умеет редактор</h2>
<ul><li>Шрифты, размеры, цвет текста и выделение, <i>курсив</i>, <u>подчёркивание</u>, <s>зачёркивание</s>, x<sub>2</sub> и x<sup>2</sup>.</li><li>Стили: заголовки, название, цитата, код — как в Word.</li><li>Списки, таблицы, рисунки, ссылки, оглавление, символы, дата и время.</li><li>Поля, ориентация и размер страницы, колонки, колонтитулы и номера страниц.</li><li>Поиск и замена, статистика, чтение вслух, история версий.</li><li>Экспорт в <b>.docx</b>, PDF, HTML и TXT, импорт .docx, печать.</li></ul>
<h2>Полезные сочетания клавиш</h2>
<table class="cw-table" style="width: 100%;"><tbody><tr><td><b>Ctrl + S</b></td><td>Сохранить сейчас</td></tr><tr><td><b>Ctrl + P</b></td><td>Печать</td></tr><tr><td><b>Ctrl + F / Ctrl + H</b></td><td>Найти / заменить</td></tr><tr><td><b>Ctrl + Enter</b></td><td>Разрыв страницы</td></tr><tr><td><b>Ctrl + K</b></td><td>Вставить ссылку</td></tr></tbody></table>
<p><br></p>
<p class="cw-quote">«Пишите. Где угодно.»</p>"""


# ---------------------------------------------------------------- база данных

def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    with closing(connect()) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript(SCHEMA)
        c.execute('DELETE FROM sessions WHERE expires < ?', (time.time(),))
        c.commit()


def sha256(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def hash_password(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), bytes.fromhex(salt), PBKDF2_ROUNDS)
    return dk.hex(), salt


def check_password(pw, pass_hash, salt):
    return hmac.compare_digest(hash_password(pw, salt)[0], pass_hash)


def html_to_text(s):
    s = re.sub(r'(?is)<(style|script)[^>]*>.*?</\1>', ' ', s)
    s = re.sub(r'(?i)<(br|/p|/h[1-6]|/li|/div|/tr|/blockquote)\b[^>]*>', '\n', s)
    s = re.sub(r'(?i)</t[dh]>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(s).replace('​', '').replace('\xa0', ' ')


def summarize(content):
    text = html_to_text(content)
    words = len(re.findall(r'\w+(?:[-\'’]\w+)*', text))
    preview = re.sub(r'[ \t\r\f\v]+', ' ', text)
    preview = re.sub(r'\s*\n\s*', '\n', preview).strip()[:420]
    return preview, words


def clean_title(t):
    t = re.sub(r'\s+', ' ', str(t or '')).strip()[:200]
    return t or 'Без названия'


# ---------------------------------------------------------------- защита от перебора паролей

_fails = {}
_fails_lock = threading.Lock()


def too_many_attempts(key):
    now = time.time()
    with _fails_lock:
        arr = [t for t in _fails.get(key, []) if now - t < 900]
        _fails[key] = arr
        return len(arr) >= 8


def note_failure(key):
    with _fails_lock:
        _fails.setdefault(key, []).append(time.time())


# ---------------------------------------------------------------- API

class ApiError(Exception):
    def __init__(self, status, message, extra=None):
        super().__init__(message)
        self.status, self.message, self.extra = status, message, extra or {}


ROUTES = []


def route(method, pattern, auth=True):
    def deco(fn):
        ROUTES.append((method, re.compile('^' + pattern + '$'), fn, auth))
        return fn
    return deco


def public_user(u):
    return {'id': u['id'], 'email': u['email'], 'name': u['name'],
            'prefs': json.loads(u['prefs'] or '{}'), 'created': u['created']}


def doc_meta(r):
    return {'id': r['id'], 'title': r['title'], 'preview': r['preview'], 'words': r['words'],
            'starred': bool(r['starred']), 'deleted': r['deleted'], 'created': r['created'],
            'updated': r['updated'], 'size': r['size'] if 'size' in r.keys() else None}


def full_doc(r):
    d = doc_meta(r)
    d['content'] = r['content']
    d['settings'] = json.loads(r['settings'] or '{}')
    return d


def own_doc(conn, user, did):
    r = conn.execute('SELECT *, length(content) AS size FROM documents WHERE id=? AND user_id=?',
                     (did, user['id'])).fetchone()
    if not r:
        raise ApiError(404, 'Документ не найден')
    return r


def insert_doc(conn, uid, title, content, settings):
    now = time.time()
    did = secrets.token_urlsafe(12)
    preview, words = summarize(content)
    conn.execute('INSERT INTO documents(id,user_id,title,content,settings,preview,words,starred,deleted,created,updated) '
                 'VALUES(?,?,?,?,?,?,?,0,NULL,?,?)',
                 (did, uid, clean_title(title), content, json.dumps(settings, ensure_ascii=False), preview, words, now, now))
    return did


def session_cookie(handler, token, max_age):
    parts = [f'cw_sid={token}', 'Path=/', 'HttpOnly', 'SameSite=Lax', f'Max-Age={max_age}']
    if COOKIE_SECURE or handler.headers.get('X-Forwarded-Proto', '').lower() == 'https':
        parts.append('Secure')
    return '; '.join(parts)


def new_session(conn, uid, handler):
    token = secrets.token_urlsafe(32)
    now = time.time()
    conn.execute('INSERT INTO sessions(token_hash,user_id,expires,created) VALUES(?,?,?,?)',
                 (sha256(token), uid, now + SESSION_TTL, now))
    return session_cookie(handler, token, SESSION_TTL)


@route('POST', '/api/register', auth=False)
def api_register(h, conn, user, body, q):
    email = str(body.get('email', '')).strip().lower()
    name = re.sub(r'\s+', ' ', str(body.get('name', ''))).strip()[:60]
    pw = str(body.get('password', ''))
    if not EMAIL_RE.match(email) or len(email) > 200:
        raise ApiError(400, 'Введите корректный e-mail')
    if len(pw) < 6:
        raise ApiError(400, 'Пароль должен быть не короче 6 символов')
    if len(pw) > 256:
        raise ApiError(400, 'Слишком длинный пароль')
    if conn.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone():
        raise ApiError(409, 'Пользователь с таким e-mail уже зарегистрирован')
    name = name or email.split('@')[0]
    ph, salt = hash_password(pw)
    uid = conn.execute('INSERT INTO users(email,name,pass_hash,salt,prefs,created) VALUES(?,?,?,?,?,?)',
                       (email, name, ph, salt, '{}', time.time())).lastrowid
    insert_doc(conn, uid, 'Добро пожаловать в CloWord', WELCOME_DOC, {})
    cookie = new_session(conn, uid, h)
    u = conn.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
    return 201, {'user': public_user(u)}, {'Set-Cookie': cookie}


@route('POST', '/api/login', auth=False)
def api_login(h, conn, user, body, q):
    email = str(body.get('email', '')).strip().lower()
    pw = str(body.get('password', ''))
    key = f'{h.client_address[0]}|{email}'
    if too_many_attempts(key):
        raise ApiError(429, 'Слишком много попыток входа. Подождите 15 минут.')
    u = conn.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
    if not u or not check_password(pw, u['pass_hash'], u['salt']):
        note_failure(key)
        raise ApiError(401, 'Неверный e-mail или пароль')
    cookie = new_session(conn, u['id'], h)
    return 200, {'user': public_user(u)}, {'Set-Cookie': cookie}


@route('POST', '/api/logout', auth=False)
def api_logout(h, conn, user, body, q):
    token = h.session_token()
    if token:
        conn.execute('DELETE FROM sessions WHERE token_hash=?', (sha256(token),))
    return 200, {'ok': True}, {'Set-Cookie': session_cookie(h, '', 0)}


@route('GET', '/api/me')
def api_me(h, conn, user, body, q):
    st = conn.execute('SELECT COUNT(*) AS n, COALESCE(SUM(words),0) AS w, COALESCE(SUM(length(content)),0) AS s '
                      'FROM documents WHERE user_id=? AND deleted IS NULL', (user['id'],)).fetchone()
    return 200, {'user': public_user(user), 'stats': {'docs': st['n'], 'words': st['w'], 'size': st['s']}}


@route('PUT', '/api/me')
def api_me_update(h, conn, user, body, q):
    if 'name' in body:
        name = re.sub(r'\s+', ' ', str(body['name'])).strip()[:60]
        if not name:
            raise ApiError(400, 'Имя не может быть пустым')
        conn.execute('UPDATE users SET name=? WHERE id=?', (name, user['id']))
    if isinstance(body.get('prefs'), dict):
        prefs = json.loads(user['prefs'] or '{}')
        prefs.update({k: v for k, v in body['prefs'].items() if isinstance(k, str) and len(k) < 40})
        conn.execute('UPDATE users SET prefs=? WHERE id=?', (json.dumps(prefs, ensure_ascii=False)[:20000], user['id']))
    u = conn.execute('SELECT * FROM users WHERE id=?', (user['id'],)).fetchone()
    return 200, {'user': public_user(u)}


@route('POST', '/api/me/password')
def api_password(h, conn, user, body, q):
    cur, new = str(body.get('current', '')), str(body.get('new', ''))
    if not check_password(cur, user['pass_hash'], user['salt']):
        raise ApiError(400, 'Текущий пароль указан неверно')
    if len(new) < 6:
        raise ApiError(400, 'Новый пароль должен быть не короче 6 символов')
    ph, salt = hash_password(new)
    conn.execute('UPDATE users SET pass_hash=?, salt=? WHERE id=?', (ph, salt, user['id']))
    # выходим на всех остальных устройствах
    conn.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', (user['id'], sha256(h.session_token() or '')))
    return 200, {'ok': True}


@route('DELETE', '/api/me')
def api_delete_account(h, conn, user, body, q):
    if not check_password(str(body.get('password', '')), user['pass_hash'], user['salt']):
        raise ApiError(400, 'Пароль указан неверно')
    conn.execute('DELETE FROM versions WHERE doc_id IN (SELECT id FROM documents WHERE user_id=?)', (user['id'],))
    conn.execute('DELETE FROM documents WHERE user_id=?', (user['id'],))
    conn.execute('DELETE FROM sessions WHERE user_id=?', (user['id'],))
    conn.execute('DELETE FROM users WHERE id=?', (user['id'],))
    return 200, {'ok': True}, {'Set-Cookie': session_cookie(h, '', 0)}


@route('GET', '/api/docs')
def api_docs(h, conn, user, body, q):
    trash = q.get('trash', ['0'])[0] == '1'
    cond = 'deleted IS NOT NULL' if trash else 'deleted IS NULL'
    rows = conn.execute('SELECT id,title,preview,words,starred,deleted,created,updated,length(content) AS size '
                        f'FROM documents WHERE user_id=? AND {cond} ORDER BY updated DESC', (user['id'],)).fetchall()
    return 200, {'docs': [doc_meta(r) for r in rows]}


@route('POST', '/api/docs')
def api_create(h, conn, user, body, q):
    settings = body.get('settings') if isinstance(body.get('settings'), dict) else {}
    did = insert_doc(conn, user['id'], body.get('title'), str(body.get('content') or '<p><br></p>'), settings)
    return 201, {'doc': full_doc(own_doc(conn, user, did))}


@route('GET', f'/api/docs/{DOC_ID}')
def api_get(h, conn, user, body, q, did):
    return 200, {'doc': full_doc(own_doc(conn, user, did))}


@route('GET', f'/api/docs/{DOC_ID}/meta')
def api_get_meta(h, conn, user, body, q, did):
    r = conn.execute('SELECT updated, title FROM documents WHERE id=? AND user_id=?', (did, user['id'])).fetchone()
    if not r:
        raise ApiError(404, 'Документ не найден')
    return 200, {'updated': r['updated'], 'title': r['title']}


@route('PUT', f'/api/docs/{DOC_ID}')
def api_update(h, conn, user, body, q, did):
    d = own_doc(conn, user, did)
    base = body.get('base_updated')
    if ('content' in body and not body.get('force') and isinstance(base, (int, float))
            and abs(d['updated'] - base) > 0.0005):
        raise ApiError(409, 'Документ был изменён на другом устройстве', {'updated': d['updated']})
    now = time.time()
    fields = {}
    if 'title' in body:
        fields['title'] = clean_title(body['title'])
    if 'content' in body:
        content = str(body['content'])
        if content != d['content']:
            last = conn.execute('SELECT MAX(created) FROM versions WHERE doc_id=?', (did,)).fetchone()[0]
            if body.get('snapshot') or last is None or now - last >= VERSION_EVERY:
                conn.execute('INSERT INTO versions(doc_id,title,content,settings,words,created) VALUES(?,?,?,?,?,?)',
                             (did, d['title'], d['content'], d['settings'], d['words'], now if body.get('snapshot') else d['updated']))
                conn.execute('DELETE FROM versions WHERE doc_id=? AND id NOT IN '
                             '(SELECT id FROM versions WHERE doc_id=? ORDER BY created DESC LIMIT ?)',
                             (did, did, VERSIONS_KEEP))
            fields['content'] = content
            fields['preview'], fields['words'] = summarize(content)
    if isinstance(body.get('settings'), dict):
        s = json.dumps(body['settings'], ensure_ascii=False)
        if s != d['settings']:
            fields['settings'] = s
    if 'starred' in body:
        fields['starred'] = 1 if body['starred'] else 0
    if set(fields) - {'starred'}:
        fields['updated'] = now
    if fields:
        sets = ', '.join(f'{k}=?' for k in fields)
        conn.execute(f'UPDATE documents SET {sets} WHERE id=?', (*fields.values(), did))
    return 200, {'updated': fields.get('updated', d['updated']), 'title': fields.get('title', d['title'])}


@route('DELETE', f'/api/docs/{DOC_ID}')
def api_delete(h, conn, user, body, q, did):
    own_doc(conn, user, did)
    if q.get('permanent', ['0'])[0] == '1':
        conn.execute('DELETE FROM versions WHERE doc_id=?', (did,))
        conn.execute('DELETE FROM documents WHERE id=?', (did,))
    else:
        conn.execute('UPDATE documents SET deleted=? WHERE id=?', (time.time(), did))
    return 200, {'ok': True}


@route('DELETE', '/api/trash')
def api_empty_trash(h, conn, user, body, q):
    conn.execute('DELETE FROM versions WHERE doc_id IN (SELECT id FROM documents WHERE user_id=? AND deleted IS NOT NULL)',
                 (user['id'],))
    n = conn.execute('DELETE FROM documents WHERE user_id=? AND deleted IS NOT NULL', (user['id'],)).rowcount
    return 200, {'deleted': n}


@route('POST', f'/api/docs/{DOC_ID}/restore')
def api_restore(h, conn, user, body, q, did):
    own_doc(conn, user, did)
    conn.execute('UPDATE documents SET deleted=NULL WHERE id=?', (did,))
    return 200, {'ok': True}


@route('POST', f'/api/docs/{DOC_ID}/duplicate')
def api_duplicate(h, conn, user, body, q, did):
    d = own_doc(conn, user, did)
    nid = insert_doc(conn, user['id'], f"Копия — {d['title']}", d['content'], json.loads(d['settings'] or '{}'))
    return 201, {'doc': doc_meta(own_doc(conn, user, nid))}


@route('GET', f'/api/docs/{DOC_ID}/versions')
def api_versions(h, conn, user, body, q, did):
    own_doc(conn, user, did)
    rows = conn.execute('SELECT id,title,words,created,length(content) AS size FROM versions '
                        'WHERE doc_id=? ORDER BY created DESC', (did,)).fetchall()
    return 200, {'versions': [dict(r) for r in rows]}


@route('GET', f'/api/docs/{DOC_ID}/versions/(\\d+)')
def api_version(h, conn, user, body, q, did, vid):
    own_doc(conn, user, did)
    r = conn.execute('SELECT * FROM versions WHERE id=? AND doc_id=?', (int(vid), did)).fetchone()
    if not r:
        raise ApiError(404, 'Версия не найдена')
    return 200, {'version': {'id': r['id'], 'title': r['title'], 'content': r['content'],
                             'settings': json.loads(r['settings'] or '{}'), 'created': r['created'], 'words': r['words']}}


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = 'CloWord/1.0'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        if os.environ.get('CLOWORD_LOG'):
            sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    def do_GET(self):
        self.dispatch('GET')

    def do_HEAD(self):
        self.dispatch('HEAD')

    def do_POST(self):
        self.dispatch('POST')

    def do_PUT(self):
        self.dispatch('PUT')

    def do_DELETE(self):
        self.dispatch('DELETE')

    # -- helpers
    def session_token(self):
        raw = self.headers.get('Cookie')
        if not raw:
            return None
        c = SimpleCookie()
        try:
            c.load(raw)
        except Exception:
            return None
        m = c.get('cw_sid')
        return m.value if m and m.value else None

    def current_user(self, conn):
        token = self.session_token()
        if not token:
            return None
        return conn.execute('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id '
                            'WHERE s.token_hash=? AND s.expires>?', (sha256(token), time.time())).fetchone()

    def security_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Frame-Options', 'DENY')

    def send_json(self, status, data, headers=None):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.security_headers()
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def dispatch(self, method):
        try:
            url = urlparse(self.path)
            if url.path.startswith('/api/'):
                self.handle_api(method, url)
            elif method in ('GET', 'HEAD'):
                self.serve_static(url.path)
            else:
                self.close_connection = True
                self.send_json(405, {'error': 'Метод не поддерживается'})
        except ApiError as e:
            self.send_json(e.status, {'error': e.message, **e.extra})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc()
            try:
                self.close_connection = True
                self.send_json(500, {'error': 'Внутренняя ошибка сервера'})
            except Exception:
                pass

    def handle_api(self, method, url):
        body = {}
        if method in ('POST', 'PUT', 'DELETE'):
            length = int(self.headers.get('Content-Length') or 0)
            if length > MAX_BODY:
                self.close_connection = True
                raise ApiError(413, 'Документ слишком большой (максимум 50 МБ)')
            raw = self.rfile.read(length) if length else b''
            # простая защита от CSRF: такой заголовок не может поставить чужой сайт без CORS
            if self.headers.get('X-Requested-With') != 'CloWord':
                raise ApiError(403, 'Запрос отклонён')
            if raw:
                try:
                    body = json.loads(raw.decode('utf-8'))
                except ValueError:
                    raise ApiError(400, 'Некорректный JSON')
                if not isinstance(body, dict):
                    raise ApiError(400, 'Некорректный запрос')
        q = parse_qs(url.query)
        for m, rx, fn, need_auth in ROUTES:
            if m != method:
                continue
            match = rx.match(url.path)
            if not match:
                continue
            with closing(connect()) as conn:
                user = self.current_user(conn)
                if need_auth and not user:
                    raise ApiError(401, 'Требуется вход в аккаунт')
                result = fn(self, conn, user, body, q, *match.groups())
                conn.commit()
            status, data = result[0], result[1]
            headers = result[2] if len(result) > 2 else None
            return self.send_json(status, data, headers)
        raise ApiError(404, 'Не найдено')

    def serve_static(self, path):
        rel = PAGES.get(path.rstrip('/') or '/', path.lstrip('/'))
        full = os.path.realpath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(STATIC_DIR + os.sep) or not os.path.isfile(full):
            body = '<!doctype html><meta charset="utf-8"><title>404</title><p style="font-family:sans-serif">Страница не найдена. <a href="/">На главную</a></p>'.encode('utf-8')
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)
            return
        st = os.stat(full)
        etag = f'"{int(st.st_mtime_ns // 1000)}-{st.st_size}"'
        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, 'application/octet-stream')
        with open(full, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('ETag', etag)
        self.security_headers()
        if ext == '.html':
            self.send_header('Content-Security-Policy', CSP)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)


def lan_ip():
    try:
        with closing(socket.socket(socket.AF_INET, socket.SOCK_DGRAM)) as s:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
    except OSError:
        return None


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    init_db()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    srv.daemon_threads = True
    ip = lan_ip()
    print('\n  CloWord запущен\n')
    print(f'  На этом компьютере:   http://localhost:{PORT}')
    if ip and HOST in ('0.0.0.0', ''):
        print(f'  С телефона / другого ПК в этой сети:   http://{ip}:{PORT}')
    print(f'  База данных: {DB_PATH}')
    print('\n  Остановить: Ctrl+C\n')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n  Остановлено.')


if __name__ == '__main__':
    main()
