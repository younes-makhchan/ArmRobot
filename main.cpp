#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver();

// Servo settings
#define SERVO_CHANNEL 7
#define SERVO_MIN 150
#define SERVO_MAX 620

// Convert angle to PCA9685 pulse
uint16_t angleToPulse(uint8_t angle)
{
  return map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
}

// Smooth move function
void moveSmooth(uint8_t channel, int startAngle, int endAngle, int stepDelay)
{
  if (startAngle < endAngle) {
    for (int a = startAngle; a <= endAngle; a++) {
      pca.setPWM(channel, 0, angleToPulse(a));
      delay(stepDelay);
    }
  } else {
    for (int a = startAngle; a >= endAngle; a--) {
      pca.setPWM(channel, 0, angleToPulse(a));
      delay(stepDelay);
    }
  }
}

void setup()
{
  Wire.begin();
  pca.begin();
  pca.setPWMFreq(50); 
  delay(10);

  pca.setPWM(SERVO_CHANNEL, 0, angleToPulse(90));
  delay(1000);
}

void loop()
{
  moveSmooth(SERVO_CHANNEL, 130, 80, 15);

  delay(500);

  moveSmooth(SERVO_CHANNEL, 80, 130, 15);

  delay(750);

  
}
