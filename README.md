## JavaScript Library (ES2015+ บนเบราว์เซอร์)
- **Socket.IO (Client)** — JavaScript WebSocket framework  
  <a href="https://socket.io/docs/v4/client-initialization/" target="_blank" rel="noopener noreferrer">https://socket.io/docs/v4/client-initialization/</a>

## Python Packages (Python 3.10+)
- **Flask** — Web framework สำหรับ backend/API  
- **numpy** — จัดการข้อมูลตัวเลขและโครงสร้างข้อมูลเชิงคณิตศาสตร์  
- **opencv-python-headless** — ไลบรารีประมวลผลภาพ (เวอร์ชันไม่มี GUI ใช้ในเซิร์ฟเวอร์/Flask)  
- **torch (PyTorch)** — Deep Learning engine (YOLO ใช้เป็น backend)  
- **ultralytics** — YOLO framework บน PyTorch (detection / segmentation / pose ฯลฯ)  
- **deep-sort-realtime** — ใช้สำหรับ Multi-Object Tracking โดยเชื่อม YOLO กับ DeepSORT  
  → YOLO ตรวจจับ (Bounding Box) แล้ว DeepSORT ติดตามวัตถุเดิมข้ามเฟรม พร้อมกำหนด track_id คงที่
  <a href="https://pypi.org/project/deep-sort-realtime/" target="_blank" rel="noopener noreferrer">https://pypi.org/project/deep-sort-realtime/</a>  
- **Flask-SocketIO** — เพิ่มความสามารถ WebSocket ให้ Flask
  <a href="https://flask-socketio.readthedocs.io/en/latest/" target="_blank" rel="noopener noreferrer">https://flask-socketio.readthedocs.io/en/latest/</a>  
- **eventlet** — *ตัวเลือก (optional)* สำหรับโหมด async I/O คู่กับ Flask‑SocketIO *(เวิร์กชอปนี้ใช้โหมด **threading** เป็นหลัก)*  
  <a href="https://eventlet.readthedocs.io/en/latest/" target="_blank" rel="noopener noreferrer">https://eventlet.readthedocs.io/en/latest/</a>

> ℹ️ หมายเหตุ: ตัวอย่าง backend ในเวิร์กชอปนี้ใช้ **OS threads (threading)**

---

## สำหรับผู้ที่มี GPU (NVIDIA)
ตรวจสอบเวอร์ชัน CUDA **โดยการ** พิมพ์คำสั่ง:

```
nvidia-smi
```

ติดตั้ง `torch` ให้ตรงกับเวอร์ชัน CUDA (เลือก **เพียงหนึ่ง** บรรทัดให้ตรงกับเครื่อง):

- CUDA 12.6
```
pip install torch --index-url https://download.pytorch.org/whl/cu126
```
- CUDA 12.8
```
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
```
- CUDA 12.9
```
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu129
```

อ้างอิง: <https://pytorch.org/get-started/locally/>

---

## โครงสร้างโปรเจกต์ (Week12)
```
flask/
├── static/
│   ├── publisher.js
│   └── viewer.js
├── templates/
│   ├── index.html
│   ├── publish.html
│   └── viewer.html
├── yolo_weights/
│   ├── yolo11m-cls.pt
│   ├── yolo11m-obb.pt
│   ├── yolo11m-pose.pt
│   ├── yolo11m-seg.pt
│   ├── yolo11m.pt
│   ├── yolo11n-cls.pt
│   ├── yolo11n-obb.pt
│   ├── yolo11n-pose.pt
│   ├── yolo11n-seg.pt
│   └── yolo11n.pt
├── server.py
└── imgcvt.py
```

---

## Workshop : Project - People Counting System

### Camera Publish (IN)
- เลือกกล้องและเชื่อมต่อ Server เพื่อ Stream ภาพส่งไป
- รับข้อมูลต่างๆ เพื่องาน Debug

### Camera Viewer (OUT)
- เชื่อมต่อ Server และรับข้อมูลภาพจากกล้องที่เลือก

### Detect and Counter
- รับข้อมูลภาพจาก (IN) นำไป Detect ถาพคนด้วย YOLO จากนั้นให้นำไป Tracking ด้วย DeepSORT และ Boardcast ภาพผลการทำงานและ data ไปตาม (OUT)

> ⚠️ WebCam บนเบราว์เซอร์ต้องรันผ่าน **https** หรือ **localhost** เพื่อให้ `getUserMedia` ทำงาน

---

## ทำให้เข้าผ่าน HTTPS ด้วย Cloudflare (แบบที่นักเรียนทำได้)

เหมาะสำหรับเดโมในคลาส/แลบเร็ว ๆ และได้ URL `https://*.trycloudflare.com` ทันที

1. ติดตั้ง **cloudflared**
   - **Windows (แนะนำใช้ winget):** เปิด PowerShell แล้วรัน

```powershell
winget install -e --id Cloudflare.cloudflared
```

```
 > หากยังไม่มี WinGet ให้ติดตั้ง **App Installer** จาก Microsoft Store ก่อน
```

- **macOS:** `brew install cloudflared`
- **Linux (Debian/Ubuntu):** `sudo apt-get install cloudflared` (หรือดูคู่มือหน้าเว็บ)

2. รัน Flask/Socket.IO ที่เครื่องนักเรียน (เช่น `http://127.0.0.1:5000`)
3. เปิดเทอร์มินัลและรัน:

```bash
cloudflared tunnel --url http://127.0.0.1:5000
```

4. จะได้ URL สาธารณะ `https://<random>.trycloudflare.com` (รองรับ WebSocket/WSS) ให้คัดลอก URL นี้ไปใส่ใน **frontend**
   - ในไฟล์ JS: แก้ค่าตัวแปร `host` เป็น URL ที่ได้ เช่น

```js
const host = "https://<random>.trycloudflare.com";
```

> หมายเหตุ: โหมด Quick Tunnel มีข้อจำกัดด้านความคงทนของ URL และขีดจำกัดทราฟฟิก เหมาะกับเดโม/ฝึกหัด

## เพิ่มเติมที่ควรรู้

### Thread / Concurrency
- **Thread** เป็นหัวข้อในวิชาระบบปฏิบัติการ — ในเวิร์กชอปนี้นักเรียนจะได้ใช้จริงกับงานคอมพิวเตอร์วิทัศน์
- ดีไซน์ที่สอนใช้ **OS threads** + จำกัดการเข้าใช้ตัวประมวลผลด้วย `Semaphore` เพื่อกันแย่ง GPU/CPU พร้อมกัน

### การส่งข้อความด้วย Socket.IO
- พื้นฐาน:
```text
socket.send(message)          -> socket.on("message")   // event มาตรฐานชื่อ "message"
socket.emit("event", payload) -> socket.on("event")     // event กำหนดชื่อเอง
```
- Build‑in events:
```text
socket.on("connect"), socket.on("disconnect"), socket.on("message")
```
- Custom events (ตัวอย่าง):
```text
socket.on("game_update"), socket.on("private_notice")
```

### JSON ↔ Python Dict (Flask‑SocketIO)
- ถ้าส่ง JSON จากฝั่งเว็บ เช่น
```json
{
  "message": "MyText",
  "nums": 120
}
```
ฝั่ง Python จะได้รับเป็น `dict` ที่ `nums` เป็น **int 120** (ไม่ใช่ string) อยู่แล้ว  
หากต้องการบังคับชนิดเองจึงค่อยแปลงภายหลัง (เช่น `int(payload["nums"])`).

### Python `collections.deque` คืออะไร?
- `collections.deque` เป็นโครงสร้างข้อมูลแบบ list ที่เพิ่ม/ลบข้อมูลได้เร็วกว่า list ปกติ (เหมาะกับ queue/stack) สามารถกำหนดขนาดสูงสุด (maxlen) ได้

### หลักการทำงานของ DeepSORT
- DeepSORT ใช้การจับคู่ (association) ระหว่างวัตถุที่ตรวจจับได้ในเฟรมปัจจุบันกับวัตถุที่ติดตามอยู่เดิม โดยใช้:
  - ตำแหน่ง Bounding Box (จาก YOLO)
  - ลักษณะเฉพาะ (feature) ของวัตถุ (จาก CNN ที่ฝึกมาแล้ว)

### หลักการนับจำนวนคน (People Counting)
- กำหนดเส้นนับ (Counting Line) ในภาพ
- นับจำนวนคนที่เดินผ่านเส้นนับนี้ในทิศทางที่กำหนด
- ใช้ `track_id` จาก DeepSORT เพื่อป้องกันการนับซ้ำของคนเดียวกัน
- สามารถนับแยกทิศทางเข้า-ออกได้ (ถ้าต้องการ)
- พยายามหน่วงเวลา (delay) ในการนับเล็กน้อยเพื่อให้แน่ใจว่าคนได้ผ่านเส้นนับจริง ๆ ป้องกันคนที่เดินผ่านขอบเส้นนับแล้วหันกลับ
