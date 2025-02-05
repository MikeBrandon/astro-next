"use client"

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PLANETS = [
  { id: 'mercury', name: 'Mercury', size: 0.8, color: 0x808080 },
  { id: 'venus', name: 'Venus', size: 1.2, color: 0xffd700 },
  { id: 'mars', name: 'Mars', size: 0.9, color: 0xff4500 },
  { id: 'jupiter', name: 'Jupiter', size: 2.8, color: 0xffa500 },
  { id: 'saturn', name: 'Saturn', size: 2.4, color: 0xffd700 },
  { id: 'uranus', name: 'Uranus', size: 1.8, color: 0x40e0d0 },
  { id: 'neptune', name: 'Neptune', size: 1.8, color: 0x0000ff },
];

const SolarSystem = () => {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [planetPositions, setPlanetPositions] = useState({});

  useEffect(() => {
    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Increased intensity
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x080820, 1); // Added hemisphere light
    const pointLight = new THREE.PointLight(0xffffff, 2, 300);
    scene.add(ambientLight, hemisphereLight, pointLight);

    // Sun
    const sunGeometry = new THREE.SphereGeometry(5, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);

    // Create planets and add them to the scene
    const planetMeshes = new Map();
    const planetOrbits = new Map();

    PLANETS.forEach(planet => {
      const geometry = new THREE.SphereGeometry(planet.size, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: planet.color,
        shininess: 5,
      });
      const mesh = new THREE.Mesh(geometry, material);
      
      // Create orbit
      const orbit = new THREE.Object3D();
      orbit.add(mesh);
      scene.add(orbit);
      
      planetMeshes.set(planet.id, mesh);
      planetOrbits.set(planet.id, orbit);

      // Add orbit line
      const orbitGeometry = new THREE.BufferGeometry();
      const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x444444 });
      const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
      scene.add(orbitLine);
    });

    const today = new Date().toISOString().split('T')[0];
    const API_KEY = "ead8f70e-66a1-4e9a-b6e6-aee38f6246a7";
    const API_SECRET =
      "973bdf221dd4fbf4976e2f3f63d286fbc7f37194a876a191428799d8eea6b04151444456460ee7707bfb17ca0b52f1e2f00f116bde107072f2dd9a4b67c3135e6b6bf2baf629257ca06cab264fe67d6d2cf020dcb20c53b7387b9c20e12042f49a4ccf7503a74c1ca98ffbba0514c7aa";
    // Function to fetch planet position
    const fetchPlanetPosition = async (planetId: string) => {
      try {
        const response = await fetch(
          `https://api.astronomyapi.com/api/v2/bodies/positions/${planetId}?latitude=0&longitude=0&elevation=0&from_date=${today}&to_date=${today}&time=00:00:00`,
          {
            headers: {
              Authorization: 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64'),
            },
          }
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ${planetId} data`);
        }
        
        const data = await response.json();
        return data;
      } catch (error) {
        console.error(`Error fetching ${planetId} data:`, error);
      }
    };

    // Update all planet positions
    const updatePlanetPositions = async () => {
      try {
        setLoading(true);
        const positions = await Promise.all(
          PLANETS.map(async planet => {
            const data = await fetchPlanetPosition(planet.id);
            return {
              id: planet.id,
              data: data
            };
          })
        );

        const newPositions = {};
        positions.forEach(({ id, data }) => {
          const planetData = data.data.table.rows[0].cells[0];
          const distance = parseFloat(planetData.distance.fromEarth.au);
          const altitude = parseFloat(planetData.position.horizontal.altitude.degrees);
          const azimuth = parseFloat(planetData.position.horizontal.azimuth.degrees);

          const phi = THREE.MathUtils.degToRad(90 - altitude);
          const theta = THREE.MathUtils.degToRad(azimuth);

          const mesh = planetMeshes.get(id);
          mesh.position.setFromSpherical(
            new THREE.Spherical(distance * 10, phi, theta)
          );

          // Store screen position for labels
          const vector = new THREE.Vector3();
          vector.setFromSpherical(new THREE.Spherical(distance * 10, phi, theta));
          vector.project(camera);
          
          newPositions[id] = {
            x: (vector.x * 0.5 + 0.5) * window.innerWidth,
            y: (-vector.y * 0.5 + 0.5) * window.innerHeight
          };
        });

        setPlanetPositions(newPositions);
        setLoading(false);
      } catch (error) {
        setError('Failed to fetch planet positions');
        setLoading(false);
      }
    };

    // Initial position update
    updatePlanetPositions();

    // Camera position
    camera.position.z = 50;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      sun.rotation.y += 0.005;
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
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

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
            className="absolute text-white bg-black bg-opacity-50 px-2 py-1 rounded transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: planetPositions[planet.id].x,
              top: planetPositions[planet.id].y
            }}
          >
            {planet.name}
          </div>
        )
      ))}
    </div>
  );
};

export default SolarSystem;