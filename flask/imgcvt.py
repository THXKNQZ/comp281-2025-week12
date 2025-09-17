import cv2
import numpy as np
import base64

def blob_cvimage(image_blob):
	np_arr = np.frombuffer(image_blob, np.uint8) # convert to numpy array (byte array)
	return cv2.imdecode(np_arr, cv2.IMREAD_COLOR) # decode image data to OpenCV format channel in B G R order

def cvimage_bytes(image, fmt='.jpg', jpeg_quality=70):
	_, buff = cv2.imencode(fmt, image, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
	return buff

def base64_cvimage(image_base64):
	"""ทำหน้าที่แปลง BASE64 string เป็น OpenCV Image (BGR color space)"""
	img_data = base64.b64decode(image_base64) # decode base64 string to image data
	np_arr = np.frombuffer(img_data, np.uint8) # convert to numpy array (byte array)
	return cv2.imdecode(np_arr, cv2.IMREAD_COLOR) # decode image data to OpenCV format channel in B G R order

def cvimage_base64(image, fmt='.jpg', jpeg_quality=70):
	"""ทำหน้าที่แปลง OpenCV Image เป็น BASE64 string"""
	_, buffer = cv2.imencode(fmt, image, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]) # encode the processed image format
	return base64.b64encode(buffer).decode('utf-8') # encode to base64 string