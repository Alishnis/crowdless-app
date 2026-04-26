import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

function EarthMesh() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const [colorMap, normalMap, specularMap] = useLoader(THREE.TextureLoader, [
    '/textures/earth.jpg',
    '/textures/earth_normal.jpg',
    '/textures/earth_specular.jpg',
  ])

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.12
    }
  })

  return (
    <mesh ref={meshRef} rotation={[0, -2.2, 0]}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshPhongMaterial
        map={colorMap}
        normalMap={normalMap}
        specularMap={specularMap}
        emissiveMap={colorMap}
        emissive={new THREE.Color('#ffffff')}
        emissiveIntensity={0.85}
        shininess={14}
      />
    </mesh>
  )
}

export default function Planet3D() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Wait for layout to settle, then mount Canvas with correct aspect ratio
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReady(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!ready) return null

  return (
    <Canvas
      camera={{ position: [0, 0, 2.6], fov: 45 }}
      gl={{ alpha: true, antialias: true }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      resize={{ debounce: 0, scroll: false }}
      dpr={[1, 2]}
      flat
      onCreated={({ gl, camera, size }) => {
        gl.setSize(size.width, size.height, false)
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = size.width / size.height
          camera.updateProjectionMatrix()
        }
      }}
    >
      <ambientLight intensity={2.0} />
      <directionalLight position={[5, 3, 5]} intensity={3.0} color="#ffffff" />
      <directionalLight position={[-3, -2, -4]} intensity={1.0} color="#a8c5ff" />
      <hemisphereLight args={['#ffffff', '#6a8fc5', 0.8]} />
      <Suspense fallback={null}>
        <EarthMesh />
      </Suspense>
    </Canvas>
  )
}
