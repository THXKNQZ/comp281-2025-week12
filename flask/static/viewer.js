// ใช้ Socket.IO (ESM) จาก CDN เวอร์ชัน 4.8.1
import { io } from 'https://cdn.socket.io/4.8.1/socket.io.esm.min.js';

// รอให้ DOM โหลดเสร็จสมบูรณ์ก่อนค่อยเริ่มทำงานหลัก
document.addEventListener('DOMContentLoaded', main);

function main() {
	// -------------------- อ้างอิง element หลัก ๆ --------------------
	const camSelect     = document.getElementById('cam-select');    // dropdown สำหรับเลือกกล้องที่ต้องการดู
	const connectBtn    = document.getElementById('connect');       // ปุ่มเชื่อมต่อเซิร์ฟเวอร์
	const disconnectBtn = document.getElementById('disconnect');    // ปุ่มตัดการเชื่อมต่อ
	const imgFrame      = document.getElementById('cam-frame');     // <img> สำหรับแสดงเฟรมภาพจากเซิร์ฟเวอร์

	// -------------------- การเชื่อมต่อ Socket.IO --------------------
	// สร้าง socket สำหรับเชื่อมต่อกับเซิร์ฟเวอร์ (กำหนด query string สำหรับระบุโหมด viewer)
	const host = "http://localhost:5000"; // เปลี่ยนเป็น host จริงถ้ารันบน server จริง
	//const host = "https://comp281-2025.sleepless.dad/"; // ตัวอย่าง host บนอินเทอร์เน็ต
	const cid = crypto.randomUUID();      // สร้าง UUID สำหรับ client viewer แต่ละคน
	const socket = io(host, { autoConnect: false, query: { cid:cid, cam_name: null, mode: "viewer" } });

	// -------------------- อัปเดต UI ตามสถานะเชื่อมต่อ --------------------
	let app_state = 1; // 1 = ยังไม่เชื่อมต่อ, 2 = เชื่อมต่อแล้ว
	function UIUpdate(state = 1) {
		// ฟังก์ชันสำหรับปรับสถานะปุ่มต่าง ๆ ตามสถานะของแอป
		switch (state) {
			case 1: // ยังไม่เชื่อมต่อ
				connectBtn.disabled = false;
				camSelect.disabled = true;
				disconnectBtn.disabled = true;
				break;
			case 2: // เชื่อมต่อแล้ว
				connectBtn.disabled = true;
				camSelect.disabled = false;
				disconnectBtn.disabled = false;
				break;
		}
	}
	// ฟังก์ชันสำหรับอัปเดตรายชื่อกล้องใน dropdown
	function CamSelectUpdate(cam_names = null) {
		if (cam_names) {
			// ถ้ามีรายชื่อกล้อง ให้แสดงใน dropdown
			camSelect.innerHTML = "<option value=\"\" selected>(เลือกกล้อง)</option>";
			cam_names.forEach((cam_name)=>{
				const opt = document.createElement("option");
				opt.value = cam_name;
				opt.textContent = cam_name;
				camSelect.appendChild(opt);
			});
			camSelect.addEventListener("change", selectedCam)
		} else {
			// ถ้าไม่มีรายชื่อกล้อง ให้ล้าง dropdown
			camSelect.innerHTML = "<option value=\"\" selected>(เลือกกล้อง)</option>";
			camSelect.removeEventListener("change", selectedCam)
		}

		// ฟังก์ชันเมื่อผู้ใช้เลือกกล้องจาก dropdown
		function selectedCam() {
			if (camSelect.value) {
				console.log("Cam to view:", camSelect.value);
				// แจ้งเซิร์ฟเวอร์ว่าต้องการดูห้องกล้องนี้
				socket.emit("view_camera_join", camSelect.value);
			} else {
				// ถ้าไม่เลือกกล้องใด ๆ ให้แจ้งเซิร์ฟเวอร์และล้างภาพ
				socket.emit("view_camera_leave", {});
				imgFrame.src = null;
			}
		}
	}
	UIUpdate(app_state); // เรียกครั้งแรกเพื่อเซ็ต UI
	CamSelectUpdate();   // ล้าง dropdown ครั้งแรก

	// -------------------- STEP 2: Connect / Disconnect --------------------
	connectBtn.onclick = () => {
		// เมื่อกดปุ่มเชื่อมต่อ ให้เชื่อมต่อ socket ไปยังเซิร์ฟเวอร์
		socket.connect();
	};

	disconnectBtn.onclick = () => {
		// เมื่อกดปุ่มตัดการเชื่อมต่อ ให้ปิด socket
		socket.disconnect();
	};

	// -------------------- Socket.IO events --------------------
	socket.on('connect', () => {
		// เมื่อเชื่อมต่อกับเซิร์ฟเวอร์สำเร็จ
		console.log('Connected to server');
		app_state = 2;
		UIUpdate(app_state);
	});

	socket.on('disconnect', () => {
		// เมื่อถูกตัดการเชื่อมต่อจากเซิร์ฟเวอร์
		console.log('Disconnected from server');
		app_state = 1;
		UIUpdate(app_state);
		CamSelectUpdate(); // ล้าง dropdown กล้อง
		socket.p.query.cam_name = "";
	});

	socket.on('message', (data) => {
		// รับข้อความทั่วไปจากเซิร์ฟเวอร์
		console.log('Received message:', data);
	});

	socket.on('view_camera_list', (data) => {
		// รับรายชื่อกล้องทั้งหมดจากเซิร์ฟเวอร์ (เมื่อเชื่อมต่อใหม่หรือมีการเปลี่ยนแปลง)
		console.log('cam_list', data);
		CamSelectUpdate(data.cameras || null);
	});

	socket.on('view_camera_frame', (data) => {
		// รับเฟรมภาพและข้อมูลนับจำนวนจากเซิร์ฟเวอร์
		// data.imgB64 คือภาพเฟรมล่าสุด (base64)
		if (data.imgB64) {
			const dataURL = `data:image/jpeg;base64,${data.imgB64}`;
			imgFrame.src = dataURL;
		}
		// data.count คือข้อมูลนับจำนวนข้ามเส้น (L2R, R2L)
		if (data.count) {
			const cam_name = data.cam_name;
			const L2R = data.count[cam_name].L2R;
			const R2L = data.count[cam_name].R2L;
			document.querySelector('#cam-name').innerHTML = cam_name;
			document.querySelector('#L2R').innerHTML = L2R;
			document.querySelector('#R2L').innerHTML = R2L;
		}
		console.log(data.count, data.ts);
	});
}