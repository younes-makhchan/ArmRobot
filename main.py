import pybullet as p
import pybullet_data
import time
import math
import numpy as np

# --- 1. Setup Environment ---
physicsClient = p.connect(p.GUI)
p.setAdditionalSearchPath(pybullet_data.getDataPath())
p.setGravity(0, 0, 0) # Zero gravity for 2D plane testing
p.resetDebugVisualizerCamera(cameraDistance=10, cameraYaw=0, cameraPitch=-89.9, cameraTargetPosition=[0, 3, 0])

# --- 2. Create Robot (2-Link Arm) ---
L1, L2 = 3.0, 3.0

# Define shapes
base_visual = p.createVisualShape(p.GEOM_BOX, halfExtents=[0.5, 0.1, 0.5], rgbaColor=[1, 1, 1, 1])
link1_visual = p.createVisualShape(p.GEOM_BOX, halfExtents=[L1/2, 0.2, 0.05], rgbaColor=[1, 1, 1, 1], visualFramePosition=[L1/2, 0, 0])
link2_visual = p.createVisualShape(p.GEOM_BOX, halfExtents=[L2/2, 0.15, 0.05], rgbaColor=[1, 1, 1, 1], visualFramePosition=[L2/2, 0, 0])

# Create the multibody
# Joint 0: Shoulder (Revolute), Joint 1: Elbow (Revolute)
robot_id = p.createMultiBody(
    baseMass=0,
    baseVisualShapeIndex=base_visual,
    basePosition=[0, 0, 0],
    linkMasses=[1, 1],
    linkVisualShapeIndices=[link1_visual, link2_visual],
    linkPositions=[[0, 0, 0], [L1, 0, 0]], # Offset of joints
    linkOrientations=[[0, 0, 0, 1], [0, 0, 0, 1]],
    linkInertialFramePositions=[[0, 0, 0], [0, 0, 0]],
    linkInertialFrameOrientations=[[0, 0, 0, 1], [0, 0, 0, 1]],
    linkParentIndices=[0, 1],
    linkJointTypes=[p.JOINT_REVOLUTE, p.JOINT_REVOLUTE],
    linkJointAxis=[[0, 0, 1], [0, 0, 1]] # Rotate around Z axis (XY plane)
)

# --- 3. Create Target Sphere ---
target_visual = p.createVisualShape(p.GEOM_SPHERE, radius=0.4, rgbaColor=[1, 0, 0, 1])
target_id = p.createMultiBody(baseMass=0, baseVisualShapeIndex=target_visual, basePosition=[4, 4, 0])

# --- 4. Animation Variables ---
smoothing = 0.08
curr_shoulder = 0
curr_elbow = 0

def lerp(start, end, t):
    return start + t * (end - start)

# --- 5. Main Loop ---
print("Click and drag the sphere in the GUI (use Ctrl+Click) or let it auto-move.")

while True:
    # Get current sphere position
    sphere_pos, _ = p.getBasePositionAndOrientation(target_id)
    tx, ty = sphere_pos[0], sphere_pos[1]
    
    # --- IK Math (Identical to your Three.js logic) ---
    dist = math.sqrt(tx**2 + ty**2)
    reach = np.clip(dist, 0.1, L1 + L2 - 0.01)
    
    # Smart Base Flip (Look Left/Right)
    target_base_flip = math.pi if tx < 0 else 0
    # Note: In PyBullet, we'll apply this flip by adjusting target angles
    
    local_x = abs(tx)
    target_angle = math.atan2(ty, local_x)
    
    # Law of Cosines
    cosA = (L1**2 + reach**2 - L2**2) / (2 * L1 * reach)
    angleA = math.acos(np.clip(cosA, -1, 1))
    
    cosB = (L1**2 + L2**2 - reach**2) / (2 * L1 * L2)
    angleB = math.acos(np.clip(cosB, -1, 1))
    
    # Calculate final targets
    # If tx < 0, we flip the math horizontally
    if tx < 0:
        target_shoulder = math.pi - (target_angle + angleA)
        target_elbow = (math.pi - angleB)
    else:
        target_shoulder = target_angle + angleA
        target_elbow = -(math.pi - angleB)

    # --- Smoothing ---
    curr_shoulder = lerp(curr_shoulder, target_shoulder, smoothing)
    curr_elbow = lerp(curr_elbow, target_elbow, smoothing)
    
    # --- Apply to Robot ---
    p.setJointMotorControl2(robot_id, 0, p.POSITION_CONTROL, targetPosition=curr_shoulder)
    p.setJointMotorControl2(robot_id, 1, p.POSITION_CONTROL, targetPosition=curr_elbow)
    
    p.stepSimulation()
    time.sleep(1./240.)