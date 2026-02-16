import http.server
import socketserver
import json
import time
import threading
import queue

PORT = 8000
SSE_QUEUE = []  # List of queues for connected clients
STATE_LOCK = threading.Lock()

# Глобальное состояние
GLOBAL_STATE = {
    "operatorStatus": "ready",
    "activeCall": None  # { "id", "state", "phoneNumber", "startTime" }
}

def broadcast_event(event_type, data):
    """Отправка события SSE всем подключенным клиентам"""
    msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    dead_queues = []
    
    for q in SSE_QUEUE:
        try:
            q.put(msg)
        except:
            dead_queues.append(q)
            
    for q in dead_queues:
        if q in SSE_QUEUE:
            SSE_QUEUE.remove(q)

class SIPRequestHandler(http.server.BaseHTTPRequestHandler):
    
    def do_GET(self):
        if self.path == '/api/sip/events':
            self.handle_sse()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        data = json.loads(body) if body else {}

        response = {"status": "ok"}
        
        with STATE_LOCK:
            if self.path == '/api/sip/call/dial':
                call_id = f"call_{int(time.time())}"
                GLOBAL_STATE["activeCall"] = {
                    "id": call_id,
                    "state": "dialing",
                    "phoneNumber": data.get("phone"),
                    "startTime": int(time.time() * 1000)
                }
                # Симуляция прогресса звонка
                threading.Timer(2.0, self._simulate_connected, args=[call_id]).start()
                
            elif self.path == '/api/sip/call/answer':
                if GLOBAL_STATE["activeCall"]:
                    GLOBAL_STATE["activeCall"]["state"] = "talking"
                    GLOBAL_STATE["activeCall"]["startTime"] = int(time.time() * 1000)
                    broadcast_event("call_connected", {"start_time": GLOBAL_STATE["activeCall"]["startTime"]})

            elif self.path == '/api/sip/call/hangup':
                GLOBAL_STATE["activeCall"] = None
                broadcast_event("call_ended", {})

            elif self.path == '/api/sip/operator/status':
                GLOBAL_STATE["operatorStatus"] = data.get("status")
                broadcast_event("status_change", {"status": GLOBAL_STATE["operatorStatus"]})
            
            elif self.path == '/api/auth/logout':
                # Логика выхода
                print("Logging out last user...")
                GLOBAL_STATE["activeCall"] = None
                GLOBAL_STATE["operatorStatus"] = "offline"
                broadcast_event("status_change", {"status": "offline"})
            
            else:
                self.send_error(404)
                return

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())

    def _simulate_connected(self, call_id):
        with STATE_LOCK:
            # Подключаем только если звонок все еще активен и совпадает ID
            if GLOBAL_STATE["activeCall"] and GLOBAL_STATE["activeCall"]["id"] == call_id:
                GLOBAL_STATE["activeCall"]["state"] = "talking"
                broadcast_event("call_connected", {"start_time": GLOBAL_STATE["activeCall"]["startTime"]})

    def handle_sse(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        q = queue.Queue()
        SSE_QUEUE.append(q)

        # Отправка начального состояния при подключении
        try:
            with STATE_LOCK:
                init_data = {
                    "status": GLOBAL_STATE["operatorStatus"]
                }
                self.wfile.write(f"event: status_change\ndata: {json.dumps(init_data)}\n\n".encode())
                
                if GLOBAL_STATE["activeCall"]:
                    # Если входящий, отправляем incoming
                    if GLOBAL_STATE["activeCall"]["state"] == 'incoming':
                         self.wfile.write(f"event: call_incoming\ndata: {json.dumps({'number': GLOBAL_STATE['activeCall']['phoneNumber'], 'call_id': GLOBAL_STATE['activeCall']['id']})}\n\n".encode())
                    # Если разговор или набор, мы могли бы отправить другое событие, но пока считаем как connected
                    else:
                         # Упрощено: просто говорим connected, если не incoming
                         self.wfile.write(f"event: call_connected\ndata: {json.dumps({'start_time': GLOBAL_STATE['activeCall']['startTime']})}\n\n".encode())
            
            self.wfile.flush()
            
            while True:
                msg = q.get()
                self.wfile.write(msg.encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            if q in SSE_QUEUE:
                SSE_QUEUE.remove(q)

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

if __name__ == '__main__':
    # Запуск фонового потока для периодической симуляции входящих звонков
    def incoming_call_simulator():
        while True:
            time.sleep(30) # Каждые 30 секунд
            with STATE_LOCK:
                if not GLOBAL_STATE["activeCall"]:
                    GLOBAL_STATE["activeCall"] = {
                        "id": f"inc_{int(time.time())}",
                        "state": "incoming",
                        "phoneNumber": "+79001234567",
                        "startTime": int(time.time() * 1000)
                    }
                    broadcast_event("call_incoming", {
                        "number": GLOBAL_STATE["activeCall"]["phoneNumber"], 
                        "call_id": GLOBAL_STATE["activeCall"]["id"]
                    })
    
    threading.Thread(target=incoming_call_simulator, daemon=True).start()

    print(f"Starting server on port {PORT}...")
    server = ThreadingHTTPServer(('0.0.0.0', PORT), SIPRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()
