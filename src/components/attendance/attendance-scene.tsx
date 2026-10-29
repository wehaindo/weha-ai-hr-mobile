'use client';

// Sample 3D attendance figure — a procedural, animated character (no model/HDR
// assets, so it works fully offline). Built with @react-three/fiber (R3F v9 for
// React 19) + drei. Client-only: load it with
//   dynamic(() => import('...'), { ssr: false }).
// The figure reacts to the punch PHASE (send → processing → result) and to the
// in/out status: reach on sending, think on processing, wave on synced, shake on
// failed, idle otherwise. Props drive all state — no DB/bridge concerns.

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Float, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { AttendanceStatus, PunchPhase } from '@/lib/attendance/status';

export interface AttendanceSceneProps {
  status: AttendanceStatus;
  phase: PunchPhase;
}

// Palette (kept as hex so THREE.Color can lerp between them).
const OUT_BODY = '#94a3b8'; // slate — checked out
const IN_BODY = '#22c55e'; // green — checked in
const OUT_RING = '#f59e0b'; // amber (brand) — checked out
const IN_RING = '#22c55e'; // green — checked in
const BUSY_RING = '#3b82f6'; // blue accent while the server works

const IDLE = { body: new THREE.Color(OUT_BODY), ring: new THREE.Color(OUT_RING) };
const TARGET: Record<AttendanceStatus, { body: THREE.Color; ring: THREE.Color }> = {
  out: { body: new THREE.Color(OUT_BODY), ring: new THREE.Color(OUT_RING) },
  in: { body: new THREE.Color(IN_BODY), ring: new THREE.Color(IN_RING) },
};
const BUSY_RING_COLOR = new THREE.Color(BUSY_RING);

const CELEBRATE_MS = 1200; // synced wave
const SHAKE_MS = 700; // failed shake

// Rest poses.
const ARM_RIGHT_REST = -0.15;
const ARM_LEFT_REST = 0.2;

function Figure({ status, phase }: AttendanceSceneProps) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);

  // Reusable colour scratchpads (avoid per-frame allocation).
  const bodyColor = useRef(IDLE.body.clone());
  const ringColor = useRef(IDLE.ring.clone());

  // Phase transition tracking (clock time in ms when the phase was entered).
  const lastPhase = useRef<PunchPhase>(phase);
  const phaseStart = useRef(-Infinity);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const nowMs = t * 1000;
    const dt = Math.min(delta, 0.1); // clamp after tab-switch spikes

    // Detect a phase change and stamp when it began.
    if (phase !== lastPhase.current) {
      lastPhase.current = phase;
      phaseStart.current = nowMs;
    }
    const since = nowMs - phaseStart.current;

    // Per-frame targets (resolved from the phase), then eased into place.
    let leanX = 0; // body lean forward
    let shakeZ = 0; // body shake
    let headTilt = Math.sin(t * 1.1) * 0.12; // idle sway baseline
    let rightZ = ARM_RIGHT_REST;
    let rightX = 0;
    let leftZ = ARM_LEFT_REST;
    let bobSpeed = 1.6;
    let bobAmp = 0.06;
    let ringPulse = 0.35; // emissive baseline

    if (phase === 'sending') {
      // Reach forward toward the "server".
      rightX = -1.1;
      rightZ = -0.4;
      leanX = 0.16;
      bobSpeed = 2.4;
      bobAmp = 0.04;
      ringPulse = 0.5 + Math.sin(t * 8) * 0.35;
    } else if (phase === 'processing') {
      // "Thinking" — head tilts, both hands raised, faster bob, pulsing ring.
      headTilt = 0.28 + Math.sin(t * 4) * 0.12;
      rightZ = -0.75;
      leftZ = 0.75;
      rightX = -0.3;
      bobSpeed = 3.4;
      bobAmp = 0.05;
      ringPulse = 0.6 + Math.sin(t * 6) * 0.4;
    } else if (phase === 'synced') {
      // Celebration wave for CELEBRATE_MS after entering synced, then rest.
      if (since >= 0 && since < CELEBRATE_MS) {
        const p = since / CELEBRATE_MS;
        const envelope = Math.sin(p * Math.PI);
        rightZ = -0.5 - Math.sin(since / 90) * 0.6 * envelope;
      }
    } else if (phase === 'failed') {
      // Shake for SHAKE_MS, arms drop, then settle.
      if (since >= 0 && since < SHAKE_MS) {
        const p = since / SHAKE_MS;
        const envelope = Math.sin(p * Math.PI);
        shakeZ = Math.sin(since / 45) * 0.28 * envelope;
        rightZ = 0.35;
        leftZ = -0.1;
      }
    }

    // Apply eased transforms (no per-frame allocation; all refs).
    if (group.current) {
      group.current.position.y = Math.sin(t * bobSpeed) * bobAmp;
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, leanX, dt * 5);
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, shakeZ, dt * 12);
    }
    if (head.current) head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, headTilt, dt * 6);
    if (rightArm.current) {
      rightArm.current.rotation.z = THREE.MathUtils.lerp(rightArm.current.rotation.z, rightZ, dt * 8);
      rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, rightX, dt * 8);
    }
    if (leftArm.current) {
      leftArm.current.rotation.z = THREE.MathUtils.lerp(leftArm.current.rotation.z, leftZ, dt * 8);
    }

    // Colour: body follows in/out status; ring pulses blue while the server works.
    const target = TARGET[status];
    bodyColor.current.lerp(target.body, dt * 4);
    if (bodyMat.current) bodyMat.current.color.copy(bodyColor.current);

    if (ringMat.current) {
      const busy = phase === 'sending' || phase === 'processing';
      ringColor.current.lerp(busy ? BUSY_RING_COLOR : target.ring, dt * 5);
      ringMat.current.color.copy(ringColor.current);
      ringMat.current.emissive.copy(ringColor.current);
      ringMat.current.emissiveIntensity = ringPulse;
    }
  });

  return (
    <group ref={group}>
      {/* Body */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.9, 1.0, 0.6]} />
        <meshStandardMaterial ref={bodyMat} color={OUT_BODY} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Head group (sways / tilts when thinking) */}
      <group ref={head} position={[0, 0.85, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.45, 32, 32]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.16, 0.05, 0.4]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0.16, 0.05, 0.4]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </group>

      {/* Legs */}
      <mesh position={[-0.22, -0.75, 0]} castShadow>
        <boxGeometry args={[0.28, 0.5, 0.3]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>
      <mesh position={[0.22, -0.75, 0]} castShadow>
        <boxGeometry args={[0.28, 0.5, 0.3]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>

      {/* Left arm — pivot at the shoulder (raises when thinking) */}
      <group ref={leftArm} position={[-0.58, 0.4, 0]}>
        <mesh position={[0, -0.35, 0]} castShadow>
          <boxGeometry args={[0.2, 0.7, 0.2]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
        </mesh>
      </group>

      {/* Right arm — reaches/waves, pivot at the shoulder */}
      <group ref={rightArm} position={[0.58, 0.4, 0]}>
        <mesh position={[0, -0.35, 0]} castShadow>
          <boxGeometry args={[0.2, 0.7, 0.2]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
        </mesh>
      </group>

      {/* Status ring around the figure (rotates + pulses) */}
      <StatusRing ringMat={ringMat} />
    </group>
  );
}

function StatusRing({
  ringMat,
}: {
  ringMat: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.z += Math.min(delta, 0.1) * 0.6;
  });
  return (
    <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
      <torusGeometry args={[1.1, 0.05, 16, 64]} />
      <meshStandardMaterial ref={ringMat} color={OUT_RING} emissive={OUT_RING} emissiveIntensity={0.35} />
    </mesh>
  );
}

export default function AttendanceScene({ status, phase }: AttendanceSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 1.2, 4], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      data-testid="attendance-canvas"
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.3} />

      <Float speed={1.4} floatIntensity={0.25} rotationIntensity={0.1}>
        <Figure status={status} phase={phase} />
      </Float>

      <ContactShadows position={[0, -1.05, 0]} opacity={0.4} scale={8} blur={2.4} far={2} />
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={2.5}
        maxDistance={7}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}
