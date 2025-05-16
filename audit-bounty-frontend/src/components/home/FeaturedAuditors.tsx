"use client";

import Image from "next/image";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";

const auditors = [
  {
    id: 1,
    name: "Alex Solana",
    designation: "Senior Smart Contract Auditor",
    image: "https://randomuser.me/api/portraits/men/1.jpg",
  },
  {
    id: 2,
    name: "Sarah Chen",
    designation: "Security Researcher",
    image: "https://randomuser.me/api/portraits/women/2.jpg",
  },
  {
    id: 3,
    name: "Michael Rodriguez",
    designation: "DeFi Security Expert",
    image: "https://randomuser.me/api/portraits/men/3.jpg",
  },
  {
    id: 4,
    name: "Emma Wilson",
    designation: "Blockchain Engineer",
    image: "https://randomuser.me/api/portraits/women/4.jpg",
  },
  {
    id: 5,
    name: "Raj Patel",
    designation: "Zero-Knowledge Specialist",
    image: "https://randomuser.me/api/portraits/men/5.jpg",
  },
];

export function FeaturedAuditors() {
  return (
    <div className="py-12">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-4">Top Security Auditors</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Connect with our community of expert security researchers and smart contract auditors
            who help keep your protocols secure.
          </p>
        </div>
        
        <div className="flex flex-col items-center justify-center">
          <AnimatedTooltip items={auditors} className="justify-center" />
          
          <div className="mt-8 max-w-xl mx-auto text-center">
            <p className="text-sm text-gray-500 mb-6">
              Our platform connects you with verified security experts from around the world.
              Hover over the profiles to learn more about our top auditors.
            </p>
            
            <div className="flex flex-wrap gap-2 justify-center">
              {["Solana", "DeFi", "NFT", "Security", "Smart Contracts"].map((tag) => (
                <span 
                  key={tag}
                  className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 