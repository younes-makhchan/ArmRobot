 #include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

#define SERVO_MIN 130
#define SERVO_MAX 630

#define SERVO_BASE     3   
#define SERVO_SHOULDER 11   
#define SERVO_ELBOW    15  

// --- NEW: Smoothing Variables ---
float currentB = 90, currentS = 90, currentE = 90; // Starting positions
float targetB = 90,  targetS = 90,  targetE = 90;
float lerpSpeed = 0.05; // Lower = Slower/Smoother (0.01 to 0.1)

int angleToPulse(int angle) {
  angle = constrain(angle, 0, 180);
  return map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
}

void setup() {
  Serial.begin(9600);
  pwm.begin();
  pwm.setPWMFreq(50);
  
  // Initialize servos to starting position
  pwm.setPWM(SERVO_BASE, 0, angleToPulse(currentB));
  pwm.setPWM(SERVO_SHOULDER, 0, angleToPulse(currentS));
  pwm.setPWM(SERVO_ELBOW, 0, angleToPulse(currentE));
}

void loop() {
  // 1. Check for new targets from Three.js
  if (Serial.available() > 0) {
    String data = Serial.readStringUntil('\n');
    data.trim();

    int baseIndex = data.indexOf('B');
    int shoulderIndex = data.indexOf('S');
    int elbowIndex = data.indexOf('E');
    
    if (baseIndex != -1 && shoulderIndex != -1 && elbowIndex != -1) {
      targetB = data.substring(baseIndex + 1, data.indexOf(',', baseIndex)).toFloat();
      targetS = data.substring(shoulderIndex + 1, data.indexOf(',', shoulderIndex)).toFloat();
      targetE = abs(data.substring(elbowIndex + 1).toFloat()); 
    }
  }

  // 2. SMOOTHING LOGIC (Linear Interpolation)
  // We move a small percentage (lerpSpeed) towards the target every loop
  if (abs(targetB - currentB) > 0.1) currentB += (targetB - currentB) * lerpSpeed;
  if (abs(targetS - currentS) > 0.1) currentS += (targetS - currentS) * lerpSpeed;
  if (abs(targetE - currentE) > 0.1) currentE += (targetE - currentE) * lerpSpeed;

  // 3. Update Hardware
  pwm.setPWM(SERVO_BASE, 0, angleToPulse((int)currentB));
  pwm.setPWM(SERVO_SHOULDER, 0, angleToPulse((int)currentS));
  pwm.setPWM(SERVO_ELBOW, 0, angleToPulse((int)currentE));

  // Small delay to prevent the CPU from redlining and allow smooth transition
  delay(30); 
}