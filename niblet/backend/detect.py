import cv2
import numpy as np
from tensorflow.keras.models import load_model

# 1. Load the model and labels
model = load_model("keras_model.h5", compile=False)
with open("labels.txt", "r") as f:
    class_names = f.readlines()

# 2. Setup Webcam
camera = cv2.VideoCapture(0)

print("System Active. Press 'Esc' to close.")

while True:
    ret, image = camera.read()
    if not ret:
        break

    # 3. Pre-process (Teachable Machine needs 224x224)
    display_img = cv2.flip(image, 1) # Mirror view for easier use
    input_img = cv2.resize(display_img, (224, 224), interpolation=cv2.INTER_AREA)
    input_img = np.asarray(input_img, dtype=np.float32).reshape(1, 224, 224, 3)
    input_img = (input_img / 127.5) - 1

    # 4. Predict
    prediction = model.predict(input_img, verbose=0)
    index = np.argmax(prediction)
    class_name = class_names[index].strip()[2:] # Removes the '0 ' or '1 '
    confidence = prediction[0][index]

    # 5. UI Logic
    # If Nail Biting is detected with more than 80% confidence
    if index == 1 and confidence > 0.8:
        msg = "STOP BITING!"
        color = (0, 0, 255) # Bright Red
    else:
        msg = "Status: OK"
        color = (0, 255, 0) # Green

    cv2.putText(display_img, f"{msg} ({round(confidence*100)}%)", (50, 50), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, color, 3)
    
    cv2.imshow("Nail Bite Detector", display_img)

    if cv2.waitKey(1) == 27:
        break

camera.release()
cv2.destroyAllWindows()