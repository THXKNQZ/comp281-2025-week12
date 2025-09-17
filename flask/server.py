# -------------------- Import Libraries --------------------
# Flask และ SocketIO สำหรับสร้าง web server และ real-time communication
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, rooms

# OpenCV, numpy สำหรับประมวลผลภาพ, imgcvt คือโมดูลแปลงภาพ base64 <-> cv2 image
import cv2, numpy as np
from imgcvt import base64_cvimage, cvimage_base64

# YOLO สำหรับตรวจจับวัตถุ, DeepSort สำหรับติดตามวัตถุ
import torch
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

# Thread, ThreadPoolExecutor สำหรับรันงาน background และ parallel
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading, time

# อื่น ๆ
from collections import deque
import json

# -------------------- YOLO / DeepSort --------------------
# ตรวจสอบว่าใช้ GPU ได้หรือไม่
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
IS_GPU = (device.type == 'cuda')

# โหลดโมเดล YOLO (เลือก model ตาม hardware)
_type = 'm' if IS_GPU else 'n'
model = YOLO(f"yolo_weights/yolo11{_type}.pt")
model.to(device)

# กำหนดค่าพารามิเตอร์สำหรับ YOLO
conf = 0.5      # ค่าความมั่นใจขั้นต่ำ
iou = 0.7       # ค่า IOU สำหรับ NMS
imgsz = 640 if IS_GPU else 320  # ขนาดภาพ input

# ฟังก์ชันสร้างอ็อบเจกต์ DeepSort สำหรับแต่ละกล้อง
def make_tracker():
	return DeepSort(
		max_age = 30,         # อายุสูงสุดของ track (frame)
		n_init = 2,           # ต้องเห็นกี่ frame ถึงจะเริ่ม track
		max_iou_distance = 0.7, # ค่าความใกล้เคียง BB
		embedder = "mobilenet", # ใช้โมเดลไหนในการ extract feature
		half = IS_GPU,        # ใช้ FP16 ถ้าเป็น GPU
		bgr = True            # ใช้ BGR (ตาม OpenCV)
	)

# -------------------- ตัวแปรสถานะกลาง --------------------
MAX_PUBLISHERS = 2        # จำนวนกล้องสูงสุดที่เชื่อมต่อพร้อมกัน
EMIT_INTERVAL = 1/100     # ความถี่ในการส่งข้อมูลไปยัง client (วินาที)

publishers = set()        # เก็บรหัส client id ของ publisher (กล้อง)
camera_frame = {}         # เก็บ frame ล่าสุดของแต่ละกล้อง (cam_name: deque)
camera_tracker = {}       # เก็บ DeepSort tracker ของแต่ละกล้อง
thread_lock = threading.Lock()  # Lock สำหรับป้องกัน race condition

# ตัวแปรสำหรับนับจำนวนคนเดินข้ามเส้นกลางกล้อง
counter = {}              # cam_name: {'L2R':int, 'R2L':int}
last_x = {}               # cam_name: {track_id: x_norm_prev}
last_cross_ts = {}        # cam_name: {track_id: last_cross_ts}
LINE_X_NORM = 0.5         # ตำแหน่งเส้นแบ่งกลางภาพ (normalized 0-1)

CROSS_COOLDOWN = 0.8      # เวลาหน่วงกันการนับซ้ำ (วินาที)
last_emit = 0             # เวลาสุดท้ายที่ส่งข้อมูล
last_emit_lock = threading.Lock() # Lock สำหรับ last_emit

# Thread pool สำหรับประมวลผล frame หลายกล้องพร้อมกัน
thread_pool = ThreadPoolExecutor(max_workers=MAX_PUBLISHERS)

# -------------------- ฟังก์ชันประมวลผลหลัก --------------------

# ฟังก์ชันนับจำนวน track ที่เดินข้ามเส้นกลางภาพ
def update_line_crossing(cam_name, tracks, img_w, now_ts):
	# 1. ดึงค่าปัจจุบันของ counter, last_x, last_cross_ts
	with thread_lock:
		# TODO: ให้นักเรียนเติม logic สำหรับนับจำนวน track ที่เดินข้ามเส้นกลางภาพ
		pass
	
	# 2. สำหรับแต่ละ track ที่ยืนยันแล้ว (is_confirmed)
	for track in tracks:
		# track ประกอบด้วย...
		# track_id: รหัสติดตาม
		# is_confirmed(): ตรวจสอบว่า track นี้ยืนยันแล้ว (ไม่ใช่ track ชั่วคราว)
		# to_ltrb(): ดึงตำแหน่ง bounding box [left, top, right, bottom]
		# last_detection: ดึงข้อมูลการตรวจจับล่าสุด [x1, y1, x2, y2], confidence, class
		if not track.is_confirmed(): continue

		# ดึงตำแหน่ง bounding box
		left, top, right, bottom = map(int, track.to_ltrb())
		
		# 1) คำนวณตำแหน่ง x ตรงกลางของ bounding box (normalized)
		cx_norm = ((left + right) / 2.0) / float(img_w)

		# 2) ดึงค่า x ก่อนหน้า (ถ้าไม่มีใช้ค่าปัจจุบัน)
		tid = track.track_id
		x_prev = x_prevs.get(tid, cx_norm)
		x_prevs[tid] = cx_norm

		# 3) ตรวจสอบว่าข้ามเส้นหรือไม่
		crossed = None
		line = LINE_X_NORM
		# TODO: ให้นักเรียนเติม logic สำหรับตรวจสอบว่าข้ามเส้นหรือไม่
		# - ถ้าข้ามจากซ้ายไปขวา crossed = 'L2R'
		# - ถ้าข้ามจากขวาไปซ้าย crossed = 'R2L'
		# - ถ้าไม่ข้าม crossed = None
		pass

# ฟังก์ชันประมวลผลภาพ: ตรวจจับ, ติดตาม, นับ, วาดกรอบ
def yolo_deepsort_process(cam_name, frameB64):
	frame_bgr = base64_cvimage(frameB64)
	
	# 1. ตรวจจับวัตถุด้วย YOLO
	r0 = model.predict(
		frame_bgr,
		conf=conf, iou=iou, imgsz=imgsz,
		verbose=False
	)[0]

	# 2. ดึงเฉพาะการตรวจจับที่เป็นคน (class 0)
	# และแปลงให้อยู่ในรูปแบบที่ DeepSort ต้องการ
	detections = []
	# TODO: ให้นักเรียนเติม logic สำหรับดึงเฉพาะการตรวจจับที่เป็นคน (class 0)
	#  โดยเพิ่ม [bounding box], confidence ลงในรายการ detections
	

	# 3. ติดตามวัตถุด้วย DeepSort
	# TODO: ให้นักเรียนเติม logic สำหรับสร้าง DeepSort tracker สำหรับกล้องนี้ (ถ้ายังไม่มี)

	# 4. นับจำนวน track ที่ข้ามเส้น
	h, w = frame_bgr.shape[:2] # ดึงขนาดภาพ, [:2] คือการตัดเอา list 2 ค่าแรก (สูง, กว้าง)
	now = time.time()
	update_line_crossing(cam_name, tracks, w, now)

	# 5. วาดกรอบ, เส้น, และ id ลงบนภาพ
	out = frame_bgr.copy()
	x_line = int(w * LINE_X_NORM)
	cv2.line(out, (x_line, 0), (x_line, h), (0, 255, 0), 1, cv2.LINE_AA)
	for track in tracks:
		if not track.is_confirmed(): continue
		left, top, right, bottom = map(int, track.to_ltrb())
		cv2.rectangle(out, (left,top), (right-left,bottom-top), (0,255,0), 1, cv2.LINE_AA)
		cv2.putText(
			out,
			f"ID:{int(track.track_id)}",
			(left, max(15, top-5)),
			cv2.FONT_HERSHEY_SIMPLEX,
			0.4,
			(0,255,0),
			2
		)
	return cvimage_base64(out) # แปลงภาพเป็น base64 แล้ว return กลับ โดยจะไปอยู่ใน future.result() ของ thread

# -------------------- Dispatcher loop (Main loop) --------------------
# ฟังก์ชันหลักสำหรับส่ง frame ที่ประมวลผลแล้วไปยัง client viewer
def dispatcher_loop():
	global last_emit
	while True:
		time.sleep(0.005) # พัก CPU เล็กน้อย

		# 1. ดึง frame ล่าสุดจากแต่ละกล้อง เพื่อเตรียมประมวลผล
		jobs = [] # (cam_name, frameB64), ใช้ frame ล่าสุดใน deque
		# TODO: ให้นักเรียนเติม logic สำหรับดึง frame ล่าสุดจากแต่ละกล้อง
		#  โดยใช้ thread_lock เพื่อป้องกัน
		
		if not jobs: continue

		# 2. ตรวจสอบความถี่ในการส่งข้อมูล (EMIT_INTERVAL)
		# ถ้าความถี่สูงเกินไปให้ข้ามการส่งข้อมูล เพื่อป้องกันการส่งข้อมูลซ้ำ
		# (ซึ่งอาจทำให้ client ค้างได้) และลดภาระของ server ลง
		# ใช้ last_emit_lock เพื่อป้องกัน race condition
		now = time.time()
		with last_emit_lock:
			if now - last_emit < EMIT_INTERVAL: continue
			last_emit = now

		# 3. ประมวลผลแต่ละกล้องแบบขนาน
		# ใช้ ThreadPoolExecutor เพื่อประมวลผลหลายกล้องพร้อมกัน
		# โดยส่งงานไปที่ฟังก์ชัน yolo_deepsort_process
		# ใช้เทคนิค future_map เพื่อจับคู่ future กับ cam_name
		future_map = {
			thread_pool.submit(yolo_deepsort_process, cam_name, B64): cam_name
			for cam_name, B64 in jobs
		}
		# รอให้แต่ละงานเสร็จ แล้วส่งข้อมูลไปยัง client viewer
		# ใช้ as_completed เพื่อดึงผลลัพธ์ตามลำดับที่เสร็จ
		# เป็นการทำงานแบบ non-blocking
		for future in as_completed(future_map):
			cam_name = future_map[future]
			imgB64 = future.result()
			data = {
				'cam_name': cam_name,
				'imgB64': imgB64,
				'count': counter,
				'ts': time.time()
			}
			# ส่งข้อมูลไปยัง viewer ของกล้องนั้น ๆ
			socketio.emit('view_camera_frame', data, to='view_'+cam_name)
		
# -------------------- Flask / SocketIO --------------------
# สร้าง Flask app และ SocketIO object
app = Flask(__name__)
socketio = SocketIO(
	app,
	async_mode = 'threading',
	cors_allowed_origins = '*',
	logger=False,
	engineio_logger=False,
	#max_http_buffer_size=20_000_000
)

# -------------------- SocketIO Events --------------------
@socketio.on('connect')
def on_connect():
	sid = request.sid
	# ดึงข้อมูลจาก query string ของ client
	cid = request.args.get('cid', sid) # รหัส client (UUID)
	cam_name = request.args.get('cam_name', None) # ชื่อกล้อง (ถ้ามี)
	mode = request.args.get('mode', None) # โหมด publisher หรือ viewer
	join_room(cid) # เข้าห้องส่วนตัว
	# ตรวจสอบโหมด
	if mode == 'publisher':
		with thread_lock:
			# จำกัดจำนวนกล้องสูงสุด
			if cid not in publishers and len(publishers) == 2:
				socketio.emit('pub_error', {'error':'กล้องเต็มจำนวนแล้ว'}, to=cid)
				return
			publishers.add(cid)
			if cam_name not in camera_frame:
				camera_frame.setdefault(cam_name, deque(maxlen=1))
	elif mode == 'viewer':
		# ส่งรายชื่อกล้องที่มีอยู่กลับไปให้ viewer
		with thread_lock:
			cam_names = [n for n in camera_frame.keys()]
		socketio.emit("view_camera_list", { 'cameras': cam_names }, to=cid)

@socketio.on('disconnect')
def on_disconnect():
	sid = request.sid
	# ดึงข้อมูลจาก query string ของ client
	cid = request.args.get('cid', sid)
	cam_name = request.args.get('cam_name', None)
	mode = request.args.get('mode', None)
	for r in rooms(): leave_room(r)
	# ถ้าเป็น publisher ให้ลบข้อมูลที่เกี่ยวข้องกับกล้องนั้นออก
	if mode == 'publisher':
		with thread_lock:
			if cid in publishers:
				publishers.remove(cid)
			if cam_name in camera_frame:
				del camera_frame[cam_name]
			if cam_name in camera_tracker:
				del camera_tracker[cam_name]
			if cam_name in counter:
				del counter[cam_name]
			if cam_name in last_x:
				del last_x[cam_name]
			if cam_name in last_cross_ts:
				del last_cross_ts[cam_name]

@socketio.on('message')
def on_message(data):
	print(f"Message: ({type(data)}) : {data}")

# -------------------- Events สำหรับ publisher --------------------
@socketio.on('pub_video_frame')
def on_pub_video_frame(data): # { cam_name:str, imgB64:str }
	sid = request.sid
	cid = request.args.get('cid', sid)
	cam_name = request.args.get('cam_name', None)
	mode = request.args.get('mode', None)
	# รับ frame จาก publisher แล้วเก็บไว้ใน camera_frame
	if mode == 'publisher':
		with thread_lock:
			if cid not in publishers: return
			if cam_name not in camera_frame:
				camera_frame.setdefault(cam_name, deque(maxlen=1))
			camera_frame[cam_name].append(data['imgB64'])

# -------------------- Events สำหรับ viewer --------------------
@socketio.on('view_camera_join')
def on_view_camera_join(data):
	sid = request.sid
	cid = request.args.get('cid', sid)
	cam_name = request.args.get('cam_name', None)
	mode = request.args.get('mode', None)
	# viewer ขอเข้าดูห้องกล้อง cam_name
	if mode == 'viewer':
		cam_name = data
		for r in rooms(): leave_room(r)
		join_room(cid)
		join_room('view_'+cam_name)

@socketio.on('view_camera_leave')
def on_view_camera_leave(data):
	sid = request.sid
	cid = request.args.get('cid', sid)
	cam_name = request.args.get('cam_name', None)
	mode = request.args.get('mode', None)
	# viewer ออกจากห้องกล้อง
	if mode == 'viewer':
		for r in rooms(): leave_room(r)
		join_room(cid)

# -------------------- Flask Routes --------------------
@app.route('/')
def route_index():
	return render_template('index.html') # หน้าแรก

@app.route('/publisher')
def route_publisher():
	return render_template('publisher.html') # หน้าสำหรับกล้อง

@app.route('/viewer')
def route_viewer():
	return render_template('viewer.html') # หน้าสำหรับผู้ชม

# -------------------- Run application --------------------
if __name__ == '__main__':
	# เริ่มรัน dispatcher_loop เป็น background task
	socketio.start_background_task(dispatcher_loop)

	HOST = '0.0.0.0'
	PORT = 5000
	DEBUG = True

	socketio.run(
		app = app,
		host = HOST,
		port = PORT,
		debug = DEBUG
	)