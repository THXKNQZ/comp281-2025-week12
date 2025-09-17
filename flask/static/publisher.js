// ใช้ Socket.IO (ESM) จาก CDN เวอร์ชัน 4.8.1
import { io } from 'https://cdn.socket.io/4.8.1/socket.io.esm.min.js';

// รอให้ DOM โหลดเสร็จสมบูรณ์ก่อนค่อยเริ่มทำงานหลัก
document.addEventListener('DOMContentLoaded', main);

function main() {
	// -------------------- อ้างอิง element หลัก ๆ --------------------
	// ดึง element ต่าง ๆ จากหน้า HTML มาเก็บไว้ใช้งาน
	const startBtn		= document.getElementById('start');         // ปุ่มเริ่มต้นเลือกกล้อง
	const fileVideo		= document.getElementById('file-video');    // input สำหรับเลือกไฟล์วิดีโอ
	const camName		= document.getElementById('cam-name');      // input สำหรับตั้งชื่อกล้อง
	const vidName		= document.getElementById('vid-name');      // input สำหรับตั้งชื่อไฟล์วิดีโอ
	const camSelect		= document.getElementById('cam-select');    // dropdown สำหรับเลือกกล้อง
	const connectBtn	= document.getElementById('connect');       // ปุ่มเชื่อมต่อเซิร์ฟเวอร์
	const disconnectBtn	= document.getElementById('disconnect');    // ปุ่มตัดการเชื่อมต่อ
	const camVideo		= document.getElementById('cam-video');     // <video> สำหรับแสดงภาพกล้อง/วิดีโอ
	const canvasFrame   = document.getElementById('cam-frame');     // <canvas> สำหรับวาดเฟรมเพื่อส่งขึ้นเซิร์ฟเวอร์
	const ctxFrame      = canvasFrame.getContext('2d');             // context สำหรับวาดภาพลง canvas

	// -------------------- การเชื่อมต่อ Socket.IO --------------------
	// สร้าง socket สำหรับเชื่อมต่อกับเซิร์ฟเวอร์ (กำหนด query string สำหรับระบุโหมดและรหัส client)
	const host = "http://localhost:5000"; // เปลี่ยนเป็น host จริงถ้ารันบน server จริง
	//const host = "https://comp281-2025.sleepless.dad/"; // ตัวอย่าง host บนอินเทอร์เน็ต
	const cid = crypto.randomUUID();      // สร้าง UUID สำหรับ client แต่ละคน
	const socket = io(host, { autoConnect: false, query: { cid: cid, cam_name: null, mode: 'publisher' } });

	// -------------------- กำหนดขนาดสูงสุดของวิดีโอ/แคนวาส --------------------
	const maxWidth  = 640;  // กำหนดความกว้างสูงสุดของวิดีโอ/แคนวาส
	const maxHeight = 640;  // กำหนดความสูงสูงสุดของวิดีโอ/แคนวาส

	// -------------------- อัตราการส่งเฟรมขึ้นเซิร์ฟเวอร์ --------------------
	const streamInterval = 100; // ms (ประมาณ 10 FPS) เพื่อลดโหลดและแบนด์วิธ
	let intervalId = null;
	intervalId = setInterval(sendFrame, streamInterval); // เรียกส่งเฟรมขึ้นเซิร์ฟเวอร์ทุก ๆ streamInterval ms

	// -------------------- อัปเดต UI ตามสถานะเชื่อมต่อ --------------------
	let app_state = 1; // ตัวแปรเก็บสถานะของแอป (1=เริ่มต้น, 2=เลือกกล้อง, 3=เลือกไฟล์, 4=เชื่อมต่อแล้ว)
	function UIUpdate(state = 1) {
		// ฟังก์ชันสำหรับปรับสถานะปุ่มต่าง ๆ ตามสถานะของแอป
		switch (state) {
			case 1: // เริ่มต้น ยังไม่เลือกกล้องหรือไฟล์
				startBtn.disabled = false;
				vidName.disabled = false;
				fileVideo.disabled = false;
				camName.disabled = true;
				camSelect.disabled = true;
				connectBtn.disabled = true;
				disconnectBtn.disabled = true;
				break;
			case 2: // เลือกกล้องแล้ว รอเชื่อมต่อ
				startBtn.disabled = true;
				vidName.disabled = true;
				fileVideo.disabled = true;
				camName.disabled = false;
				camSelect.disabled = false;
				connectBtn.disabled = false;
				disconnectBtn.disabled = true;
				break;
			case 3: // เลือกไฟล์วิดีโอแล้ว รอเชื่อมต่อ
				startBtn.disabled = true;
				fileVideo.disabled = true;
				camName.disabled = true;
				camSelect.disabled = true;
				connectBtn.disabled = false;
				disconnectBtn.disabled = true;
				break;
			case 4: // เชื่อมต่อกับเซิร์ฟเวอร์แล้ว
				startBtn.disabled = true;
				fileVideo.disabled = true
				camName.disabled = true;
				camSelect.disabled = true;
				connectBtn.disabled = true;
				disconnectBtn.disabled = false;
		}
	}
	function resetVideo() {
		// ฟังก์ชันสำหรับรีเซ็ต <video> และ input ต่าง ๆ เมื่อเปลี่ยนกล้อง/ไฟล์ หรือยกเลิกการเชื่อมต่อ
		camVideo.srcObject?.getTracks().forEach(t => t.stop()); // ปิด stream กล้องเดิม
		camVideo.srcObject = null;
		camVideo.src = "";
		fileVideo.value = "";
	}
	UIUpdate(app_state); // เรียกครั้งแรกเพื่อเซ็ต UI

	// -------------------- ตั้งขนาด canvas เท่ากับวิดีโอ เมื่อ metadata พร้อม --------------------
	camVideo.onloadedmetadata = () => {
		// เมื่อวิดีโอโหลด metadata เสร็จ (รู้ขนาดวิดีโอ) ให้ปรับขนาด video/canvas ให้เหมาะสม
		const vw = camVideo.videoWidth;
		const vh = camVideo.videoHeight;

		// ย่อ/คงสัดส่วนให้ไม่เกิน maxWidth x maxHeight
		let w, h;
		if (vw > vh) { // แนวนอน
			if (vw > maxWidth) {
				w = maxWidth;
				h = vh * (maxWidth / vw);
			} else {
				w = vw;
				h = vh;
			}
		} else { // แนวตั้ง
			if (vh > maxHeight) {
				w = vw * (maxHeight / vh);
				h = maxHeight;
			} else {
				w = vw;
				h = vh;
			}
		}

		// ตั้งขนาด video/canvas ให้เท่ากัน
		camVideo.width   = w;
		camVideo.height  = h;
		canvasFrame.width    = w;
		canvasFrame.height   = h;
	}; // onloadedmetadata

	// -------------------- STEP 1: ขอสิทธิ์และเลือกกล้อง/เลือกไฟล์ video --------------------
	startBtn.onclick = () => {
		// เมื่อกดปุ่มเริ่มต้น ให้เรียกขอสิทธิ์กล้องและแสดงรายการกล้อง
		initCamera();
	};
	fileVideo.onchange = () => {
		// เมื่อเลือกไฟล์วิดีโอ ให้สร้าง URL ชั่วคราวแล้วเล่นวิดีโอ
		const file = fileVideo.files[0];
		if (file) {
			const videoURL = URL.createObjectURL(file);
			// หมายเหตุ: ถ้าเปลี่ยนไฟล์/ออกจากหน้า ควรเรียก URL.revokeObjectURL(videoURL) เพื่อคืนหน่วยความจำ
			camVideo.src = videoURL;
			camVideo.play();
			app_state = 3;
			UIUpdate(app_state);
		}
	};

	// -------------------- STEP 2: Connect / Disconnect --------------------
	connectBtn.onclick = () => {
		// เมื่อกดปุ่มเชื่อมต่อ ให้กำหนดชื่อกล้อง/วิดีโอ แล้วเชื่อมต่อ socket ไปยังเซิร์ฟเวอร์
		const _name = camName.value;
		const _vid = vidName.value;
		socket.p.query.cam_name = (app_state == 2)? _name : _vid;
		socket.connect();      // เปิด socket ไปยังเซิร์ฟเวอร์
	};

	disconnectBtn.onclick = () => {
		// เมื่อกดปุ่มตัดการเชื่อมต่อ ให้ปิด socket
		socket.disconnect();
	};

	// -------------------- Socket.IO events --------------------
	socket.on('connect', () => {
		// เมื่อเชื่อมต่อกับเซิร์ฟเวอร์สำเร็จ
		console.log('Connected to server');
		app_state = 4;
		UIUpdate(app_state);
	});

	socket.on('disconnect', () => {
		// เมื่อถูกตัดการเชื่อมต่อจากเซิร์ฟเวอร์
		console.log('Disconnected from server');
		app_state = 1;
		UIUpdate(app_state);
		resetVideo();
	});

	socket.on('message', (data) => {
		// รับข้อความทั่วไปจากเซิร์ฟเวอร์
		console.log('Received message:', data);
	});

	socket.on('pub_error', (data) => {
		// รับ error จากเซิร์ฟเวอร์ (เช่น กล้องเต็ม)
		console.error('Error:', data.error);
	});

	// -------------------- ส่งเฟรมขึ้นเซิร์ฟเวอร์ --------------------
	function sendFrame() {
		// ฟังก์ชันนี้จะถูกเรียกทุก streamInterval ms เพื่อส่งเฟรมภาพขึ้นเซิร์ฟเวอร์
		if (!socket.connected) return;

		// 1) วาดภาพจาก <video> ลง canvas (เฟรมล่าสุด)
		ctxFrame.drawImage(camVideo, 0, 0, camVideo.width, camVideo.height);

		// 2) แปลงเป็น JPEG 70% แบบ BASE64 แล้วส่งไปเซิร์ฟเวอร์
		const dataURL = canvasFrame.toDataURL("image/jpeg", 0.7);
		const base64 = dataURL.split(',')[1];
		if (socket.connected) {
			const data = {
				cam_name: socket.p.query.cam_name,
				imgB64: base64
			};
			socket.emit("pub_video_frame", data);
		}
	}

	// -------------------- เริ่มต้นระบบกล้อง --------------------
	async function initCamera() {
		// ขอสิทธิ์ใช้งานกล้อง (บางเบราว์เซอร์จะไม่แสดง label จนกว่าจะได้สิทธิ์)
		const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
		// ปิด stream ชั่วคราว (แค่ต้องการสิทธิ์และ label สำหรับ enumerateDevices)
		tmp.getTracks().forEach(t => t.stop());

		// ดึงรายการอุปกรณ์ทั้งหมด แล้วกรองเอาเฉพาะ 'videoinput'
		navigator.mediaDevices.enumerateDevices()
		.then(devices => {
			camSelect.innerHTML = "<option value=\"\">(เลือกกล้อง)</option>";
			devices.forEach(device => {
				// แสดงชื่อกล้องแต่ละตัวใน dropdown
				if (device.kind === 'videoinput') {
					const option = document.createElement('option');
					option.value = device.deviceId; // ใช้ deviceId เป็น value
					option.textContent = device.label || `Webcam ${camSelect.options.length + 1}`;
					camSelect.appendChild(option);
				}
			});
			camSelect.addEventListener('change', userSelectedCamera);
			app_state = 2;
			UIUpdate(app_state);
		})
		.catch(err => {
			console.error('ไม่สามารถเข้าถึงอุปกรณ์ได้:', err);
		});
	}

	// -------------------- เมื่อผู้ใช้เลือกกล้อง --------------------
	function userSelectedCamera() {
		// เมื่อผู้ใช้เลือกกล้องใหม่ ให้หยุดกล้องเดิมก่อนเพื่อไม่ให้กินทรัพยากร
		resetVideo();

		const selectedDeviceId = camSelect.value;
		if (selectedDeviceId) {
			// ขอสิทธิ์ใช้งานกล้องที่เลือก (ระบุ deviceId แบบ exact)
			navigator.mediaDevices.getUserMedia({
				video: {
					deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined
				}
			}).then(stream => {
				camVideo.srcObject = stream;
				camVideo.play();
				// หมายเหตุ: ถ้ากล้องใหม่มีสัดส่วนต่างไป ควร trigger ให้ onloadedmetadata ปรับขนาด canvas อีกครั้ง
			}).catch(err => {
				console.error("Error accessing webcam:", err);
			});
		}
	}
}