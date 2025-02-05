"use client"

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

interface PlanetData {
  id: string;
  name: string;
  size: number; // Size in Earth radii
  color: number;
  inclination?: number; // Orbital inclination in degrees
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

// Planet sizes in Earth radii and orbital inclinations in degrees
const PLANETS: PlanetData[] = [
  { id: 'sun', name: 'Sun', size: 109 / 50, color: 0xffff00, inclination: 0 },
  { id: 'mercury', name: 'Mercury', size: 0.383, color: 0x808080, inclination: 7.0 },
  { id: 'venus', name: 'Venus', size: 0.949, color: 0xffd700, inclination: 3.4 },
  { id: 'earth', name: 'Earth', size: 1.0, color: 0x0077be, inclination: 0.0 },
  { id: 'mars', name: 'Mars', size: 0.532, color: 0xff4500, inclination: 1.9 },
  { id: 'jupiter', name: 'Jupiter', size: 11.209, color: 0xffa500, inclination: 1.3 },
  { id: 'saturn', name: 'Saturn', size: 9.449, color: 0xffd700, inclination: 2.5 },
  { id: 'uranus', name: 'Uranus', size: 4.007, color: 0x40e0d0, inclination: 0.8 },
  { id: 'neptune', name: 'Neptune', size: 3.883, color: 0x0000ff, inclination: 1.8 },
];

const SCALE_FACTOR = 10; // Scale factor for converting AU to scene units
const SIZE_SCALE = 0.5; // Scale factor for planet sizes to keep them visible but not too large
const ORBIT_INCLINATION = (Math.PI / 2) + (23 * Math.PI / 180); // 113 degrees (90 + 23)

const SolarSystem = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planetPositions, setPlanetPositions] = useState<PlanetPositions>({});
  const [planetData, setPlanetData] = useState<ApiResponse | null>(null);

  // Fetch planet data only once on mount
  useEffect(() => {
    const fetchPlanetData = async () => {
      try {
        const now = new Date();
        const timestamp = now.toISOString();
        const response = await fetch(`http://localhost:5000/coordinates?timestamp=${timestamp}`);
        const data: ApiResponse = await response.json();
        setPlanetData(data);
        setLoading(false);
      } catch (error) {
        setError('Failed to fetch planet data');
        setLoading(false);
      }
    };

    fetchPlanetData();
  }, []); // Empty dependency array means run once on mount

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

    // Create sun first
    const sunGeometry = new THREE.SphereGeometry(PLANETS[0].size * SIZE_SCALE, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: PLANETS[0].color,
      emissive: PLANETS[0].color,
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);

    // Create planets and add them to the scene
    const planetMeshes = new Map();
    planetMeshes.set('sun', sun);

    // Create planets (excluding sun which is already created)
    PLANETS.slice(1).forEach(planet => {
      const geometry = new THREE.SphereGeometry(planet.size * SIZE_SCALE, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: planet.color,
        shininess: 5,
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

        // Create orbit line
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
    camera.position.z = 100;
    camera.position.y = 50;
    camera.lookAt(0, 0, 0);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Animation loop
    let animationFrameId: number;
    
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      
      // Update planet label positions
      PLANETS.forEach(planet => {
        const mesh = planetMeshes.get(planet.id);
        const vector = new THREE.Vector3();
        vector.setFromMatrixPosition(mesh.matrixWorld);
        vector.project(camera);
        
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
        
        setPlanetPositions(prev => ({
          ...prev,
          [planet.id]: { x, y }
        }));
      });
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
  }, [planetData]); // Re-run if planetData changes

  const focusOnPlanet = (planetId: string) => {
    if (!planetData?.data[planetId] || !controlsRef.current) return;

    const coords = planetData.data[planetId];
    const targetPosition = new THREE.Vector3(
      coords.x * SCALE_FACTOR,
      coords.y * SCALE_FACTOR,
      coords.z * SCALE_FACTOR
    );

    // Calculate camera position to be slightly offset from the planet
    const offset = new THREE.Vector3(15, 10, 15);
    const cameraTargetPosition = targetPosition.clone().add(offset);

    // Smoothly move the camera
    const controls = controlsRef.current;
    controls.target.copy(targetPosition);
    controls.object.position.copy(cameraTargetPosition);
  };

  return (
    <div className="relative w-full h-screen">
      <div className="w-full h-screen" ref={mountRef} />
      {loading && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-2 rounded">
          Loading planet positions...
        </div>
      )}
      {error && (
        <div className="absolute top-4 left-4 bg-red-500 bg-opacity-50 text-white p-2 rounded">
          {error}
        </div>
      )}
      {PLANETS.map(planet => (
        planetPositions[planet.id] && (
          <div
            key={planet.id}
            className="absolute text-white bg-black bg-opacity-50 px-2 py-1 rounded transform -translate-x-1/2 -translate-y-[calc(50%+24px)] cursor-pointer hover:bg-opacity-75"
            style={{
              left: planetPositions[planet.id].x,
              top: planetPositions[planet.id].y
            }}
            onClick={() => focusOnPlanet(planet.id)}
          >
            {planet.name}
          </div>
        )
      ))}
    </div>
  );
};

export default SolarSystem;