"use client"

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';

interface PlanetData {
  id: string;
  name: string;
  size: number; // Size in Earth radii
  color: number;
  inclination?: number; // Orbital inclination in degrees
  textureMap: string;
}

interface PlanetPosition {
  x: number;
  y: number;
}

interface PlanetPositions {
  [key: string]: PlanetPosition;
}

interface CoordinateData {
  timestamp: string;
  x: number; // In astronomical units
  y: number;
  z: number;
}

interface ApiResponse {
  data: {
    [key: string]: CoordinateData;
  };
  status: string;
}

interface CameraState {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

interface PlanetDistance {
  id: string;
  name: string;
  distance: number;
  position: PlanetPosition;
}

// Planet sizes in Earth radii and orbital inclinations in degrees
const PLANETS: PlanetData[] = [
  { id: 'sun', name: 'Sun', size: 109 / 50, color: 0xffff00, inclination: 0, textureMap: '/textures/2k_sun.jpg' },
  { id: 'mercury', name: 'Mercury', size: 0.383, color: 0x808080, inclination: 7.0, textureMap: '/textures/2k_mercury.jpg' },
  { id: 'venus', name: 'Venus', size: 0.949, color: 0xffd700, inclination: 3.4, textureMap: '/textures/2k_venus.jpg' },
  { id: 'earth', name: 'Earth', size: 1.0, color: 0x0077be, inclination: 0.0, textureMap: '/textures/2k_earth.jpg' },
  { id: 'mars', name: 'Mars', size: 0.532, color: 0xff4500, inclination: 1.9, textureMap: '/textures/2k_mars.jpg' },
  { id: 'jupiter', name: 'Jupiter', size: 11.209, color: 0xffa500, inclination: 1.3, textureMap: '/textures/2k_jupiter.jpg' },
  { id: 'saturn', name: 'Saturn', size: 9.449, color: 0xffd700, inclination: 2.5, textureMap: '/textures/2k_saturn.jpg' },
  { id: 'uranus', name: 'Uranus', size: 4.007, color: 0x40e0d0, inclination: 0.8, textureMap: '/textures/2k_uranus.jpg' },
  { id: 'neptune', name: 'Neptune', size: 3.883, color: 0x0000ff, inclination: 1.8, textureMap: '/textures/2k_neptune.jpg' },
];

const SCALE_FACTOR = 10; // Scale factor for converting AU to scene units
const SIZE_SCALE = 0.5; // Scale factor for planet sizes to keep them visible but not too large
const ORBIT_INCLINATION = (Math.PI / 2) + (23 * Math.PI / 180); // 113 degrees (90 + 23)

const SolarSystem = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const dragControlsRef = useRef<DragControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planetPositions, setPlanetPositions] = useState<PlanetPositions>({});
  const [planetData, setPlanetData] = useState<ApiResponse | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState | null>(null);
  const [distances, setDistances] = useState<PlanetDistance[]>([]);
  const [focusedPlanet, setFocusedPlanet] = useState<string | null>(null);

  useEffect(() => {
    setTimestamp(new Date().toISOString());
  }, []);

  // Fetch planet data whenever timestamp changes
  useEffect(() => {
    const fetchPlanetData = async () => {
      try {
        // Store current camera state before updating
        if (controlsRef.current) {
          setCameraState({
            position: controlsRef.current.object.position.clone(),
            target: controlsRef.current.target.clone()
          });
        }

        setLoading(true);
        const response = await fetch(`http://localhost:5000/coordinates?timestamp=${timestamp || new Date().toISOString()}`);
        const data: ApiResponse = await response.json();
        setPlanetData(data);
        setLoading(false);
      } catch (error) {
        setError('Failed to fetch planet data');
        setLoading(false);
      }
    };

    fetchPlanetData();
  }, [timestamp]); // Re-run when timestamp changes

  // Setup three.js scene after planetData is loaded
  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x080820, 1);
    const pointLight = new THREE.PointLight(0xffffff, 2, 300);
    scene.add(ambientLight, hemisphereLight, pointLight);

    // Create draggable object
    const draggableGeometry = new THREE.BoxGeometry(2, 2, 2);
    const draggableMaterial = new THREE.MeshPhongMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.8
    });
    const draggableCube = new THREE.Mesh(draggableGeometry, draggableMaterial);
    draggableCube.position.set(20, 20, 20);
    scene.add(draggableCube);

    // Texture loader
    const textureLoader = new THREE.TextureLoader();

    // Create sun first
    const sunGeometry = new THREE.SphereGeometry(PLANETS[0].size * SIZE_SCALE, 64, 64);
    const sunTexture = textureLoader.load(PLANETS[0].textureMap);
    const sunMaterial = new THREE.MeshBasicMaterial({
      map: sunTexture,
      emissive: PLANETS[0].color,
      emissiveIntensity: 0.5
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);

    // Add point light at sun's position
    const sunLight = new THREE.PointLight(0xffffff, 2, 300);
    sun.add(sunLight);

    // Create planets and add them to the scene
    const planetMeshes = new Map();
    planetMeshes.set('sun', sun);

    // Create planets (excluding sun which is already created)
    PLANETS.slice(1).forEach(planet => {
      const geometry = new THREE.SphereGeometry(planet.size * SIZE_SCALE, 64, 64);
      const texture = textureLoader.load(planet.textureMap);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        metalness: 0.1,
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(geometry, material);

      // Position planet based on API data if available
      if (planetData?.data[planet.id]) {
        const coords = planetData.data[planet.id];
        mesh.position.set(
          coords.x * SCALE_FACTOR,
          coords.y * SCALE_FACTOR,
          coords.z * SCALE_FACTOR
        );

        // Create orbit line with gradient
        const distance = Math.sqrt(
          Math.pow(coords.x * SCALE_FACTOR, 2) + 
          Math.pow(coords.y * SCALE_FACTOR, 2) + 
          Math.pow(coords.z * SCALE_FACTOR, 2)
        );
        const orbitGeometry = new THREE.RingGeometry(distance - 0.1, distance + 0.1, 128);
        const orbitMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x666666,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.3
        });
        const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
        
        // Apply global inclination plus planet-specific inclination
        const totalInclination = ORBIT_INCLINATION + ((planet.inclination || 0) * Math.PI / 180);
        orbit.rotation.x = Math.PI / 2 + totalInclination;
        
        // Also rotate the planet to match total inclination
        mesh.rotation.x = totalInclination;
        
        scene.add(orbit);

      } else {
        // Fallback to default position
        mesh.position.set(10, 0, 0);
      }

      scene.add(mesh);
      planetMeshes.set(planet.id, mesh);
    });

    // Camera position
    if (cameraState) {
      camera.position.copy(cameraState.position);
    } else {
      camera.position.z = 100;
      camera.position.y = 50;
      camera.lookAt(0, 0, 0);
    }

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    if (cameraState) {
      controls.target.copy(cameraState.target);
    }
    controlsRef.current = controls;

    // DragControls for the draggable cube
    const dragControls = new DragControls([draggableCube], camera, renderer.domElement);
    dragControlsRef.current = dragControls;

    // Disable orbit controls while dragging
    dragControls.addEventListener('dragstart', () => {
      controls.enabled = false;
    });
    dragControls.addEventListener('dragend', () => {
      controls.enabled = true;
    });

    // Animation loop
    let animationFrameId: number;
    
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      
      // Rotate sun slowly
      sun.rotation.y += 0.001;
      
      // Rotate planets
      PLANETS.slice(1).forEach(planet => {
        const mesh = planetMeshes.get(planet.id);
        if (mesh) {
          mesh.rotation.y += 0.005;
        }
      });
      
      renderer.render(scene, camera);
      
      // Update planet label positions and distances
      const newDistances: PlanetDistance[] = [];
      PLANETS.forEach(planet => {
        const mesh = planetMeshes.get(planet.id);
        const vector = new THREE.Vector3();
        vector.setFromMatrixPosition(mesh.matrixWorld);
        vector.project(camera);
        
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
        
        const position = { x, y };
        
        // Calculate distance from draggable cube
        const distance = draggableCube.position.distanceTo(mesh.position);
        newDistances.push({
          id: planet.id,
          name: planet.name,
          distance: Number((distance / SCALE_FACTOR).toFixed(2)), // Convert back to AU and round to 2 decimals
          position
        });
      });
      
      // Sort distances from nearest to farthest
      newDistances.sort((a, b) => a.distance - b.distance);
      setDistances(newDistances);
      
      // Update planet positions based on sorted distances
      const newPlanetPositions: PlanetPositions = {};
      newDistances.forEach(planet => {
        newPlanetPositions[planet.id] = planet.position;
      });
      setPlanetPositions(newPlanetPositions);
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      mountRef.current?.removeChild(renderer.domElement);
      // Clean up three.js resources
      scene.clear();
      renderer.dispose();
    };
  }, [planetData, cameraState]); // Re-run if planetData or cameraState changes

  const focusOnPlanet = (planetId: string) => {
    if (!planetData?.data[planetId] || !controlsRef.current) return;

    const coords = planetData.data[planetId];
    const targetPosition = new THREE.Vector3(
      coords.x * SCALE_FACTOR,
      coords.y * SCALE_FACTOR,
      coords.z * SCALE_FACTOR
    );

    // Calculate camera position to be very close to the planet
    // Get planet size to determine appropriate distance
    const planet = PLANETS.find(p => p.id === planetId);
    const planetSize = (planet?.size || 1) * SIZE_SCALE;
    const distance = planetSize * 3; // Position camera 3x the planet's radius away

    // Calculate offset based on planet size
    const offset = new THREE.Vector3(distance, distance/2, distance);
    const cameraTargetPosition = targetPosition.clone().add(offset);

    // Smoothly animate the camera to the new position
    const controls = controlsRef.current;
    const startPosition = controls.object.position.clone();
    const startTarget = controls.target.clone();
    const duration = 1000; // Animation duration in ms
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use easing function for smooth animation
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      controls.object.position.lerpVectors(startPosition, cameraTargetPosition, easeProgress);
      controls.target.lerpVectors(startTarget, targetPosition, easeProgress);
      controls.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    };

    animateCamera();
    
    // Set focused planet
    setFocusedPlanet(planetId);
  };

  return (
    <div className="relative w-full h-screen bg-black">
      <div className="w-full h-screen" ref={mountRef} />
      
      {/* Time selector */}
      <div className="absolute top-6 right-6">
        <input
          type="datetime-local"
          value={timestamp?.slice(0, 16) || ''}
          onChange={(e) => setTimestamp(new Date(e.target.value).toISOString())}
          className="bg-[#1c1c1e] text-white border border-[#2c2c2e] rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-white/20"
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-[#1c1c1e]/90 backdrop-blur-md text-white/90 px-4 py-2 rounded-xl">
          Loading planet positions...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-red-500/90 backdrop-blur-md text-white px-4 py-2 rounded-xl">
          {error}
        </div>
      )}

      {/* Distances panel */}
      <div className="absolute top-6 left-6 bg-[#1c1c1e]/80 backdrop-blur-md text-white/90 p-6 rounded-2xl max-h-96 overflow-y-auto">
        <h3 className="font-medium text-lg mb-4">Distances (AU)</h3>
        <ul className="space-y-2">
          {distances.map(planet => (
            <li key={planet.id} className="flex items-center space-x-2">
              <span>{planet.name}:</span>
              <span className="font-light">{planet.distance}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Planet labels */}
      {distances.map(planet => (
        planetPositions[planet.id] && (
          <div
            key={planet.id}
            className={`absolute text-white/90 bg-[#1c1c1e]/80 backdrop-blur-md px-3 py-1.5 ${focusedPlanet === planet.id ? 'rounded-md' : 'rounded-full'} transform -translate-x-1/2 -translate-y-[calc(50%+24px)] cursor-pointer transition-colors hover:bg-[#2c2c2e]/80`}
            style={{
              left: planetPositions[planet.id].x,
              top: planetPositions[planet.id].y
            }}
            onClick={() => focusOnPlanet(planet.id)}
          >
            <div>{planet.name}</div>
            {focusedPlanet === planet.id && (
              <div className="text-xs opacity-75 mt-1">
                {timestamp?.slice(0, 19)}Z
                <br />
                {distances.filter(p => p.id !== planet.id && p.id !== 'sun').slice(0, 2).map(p => (
                  `${p.name}: ${p.distance} AU`
                )).join(' | ')}
                <br />
                Sun: {distances.find(p => p.id === 'sun')?.distance} AU
              </div>
            )}
          </div>
        )
      ))}

      {/* Bottom info bar */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-[#1c1c1e]/80 backdrop-blur-md text-white/90 px-6 py-3 rounded-2xl text-center font-light">
        <span className="font-medium">{timestamp?.slice(0, 19)}Z</span>
        {distances.length > 1 && (
          <span className="mx-4">
            {distances.filter(p => p.id !== 'sun')[0].name}: {distances.filter(p => p.id !== 'sun')[0].distance} AU | 
            {distances.filter(p => p.id !== 'sun')[1].name}: {distances.filter(p => p.id !== 'sun')[1].distance} AU
          </span>
        )}
        {distances.find(p => p.id === 'sun') && (
          <span>
            {distances.find(p => p.id === 'sun')?.name}: {distances.find(p => p.id === 'sun')?.distance} AU
          </span>
        )}
      </div>
    </div>
  );
};

export default SolarSystem;