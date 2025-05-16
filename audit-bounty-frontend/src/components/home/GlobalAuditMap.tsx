"use client";

import { WorldMap } from "@/components/ui/world-map";

// Sample connections between different global locations
const auditConnections = [
  {
    start: { lat: 37.7749, lng: -122.4194, label: "San Francisco" }, // San Francisco
    end: { lat: 51.5074, lng: -0.1278, label: "London" }, // London
  },
  {
    start: { lat: 1.3521, lng: 103.8198, label: "Singapore" }, // Singapore
    end: { lat: 35.6762, lng: 139.6503, label: "Tokyo" }, // Tokyo
  },
  {
    start: { lat: 40.7128, lng: -74.0060, label: "New York" }, // New York
    end: { lat: 48.8566, lng: 2.3522, label: "Paris" }, // Paris
  },
  {
    start: { lat: -33.8688, lng: 151.2093, label: "Sydney" }, // Sydney
    end: { lat: 55.7558, lng: 37.6173, label: "Moscow" }, // Moscow
  },
  {
    start: { lat: 19.4326, lng: -99.1332, label: "Mexico City" }, // Mexico City
    end: { lat: -22.9068, lng: -43.1729, label: "Rio de Janeiro" }, // Rio de Janeiro
  },
  {
    start: { lat: 52.5200, lng: 13.4050, label: "Berlin" }, // Berlin
    end: { lat: 25.2048, lng: 55.2708, label: "Dubai" }, // Dubai
  }
];

export function GlobalAuditMap() {
  return (
    <section className="py-16 bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-4">Global Audit Network</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Our platform connects security researchers and projects from around the world, 
            ensuring your smart contracts get the best security reviews possible.
          </p>
        </div>
        
        <div className="overflow-hidden mx-auto max-w-[110%] -mx-4">
          <WorldMap dots={auditConnections} lineColor="#6366f1" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-indigo-100 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">Global Coverage</h3>
            <p className="text-gray-600">
              Access security experts from across different time zones for continuous audit coverage.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-indigo-100 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">Diverse Expertise</h3>
            <p className="text-gray-600">
              Benefit from varied perspectives and specialized knowledge from different security communities worldwide.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-indigo-100 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">Transparent Pricing</h3>
            <p className="text-gray-600">
              Set bounties in your preferred currency and pay only for verified vulnerabilities found by auditors.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
} 