'use client';

import Link from 'next/link';
import { HighlightGroup, HighlighterItem } from '@/components/ui/highlight';
import { Shield, Search, Wallet } from 'lucide-react';

export function FeatureCards() {
  return (
    <div className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900">Why Choose Sol Audit?</h2>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Our platform connects smart contract developers with security auditors on the Solana blockchain
          </p>
        </div>
        
        <HighlightGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 group">
          <HighlighterItem className="group">
            <div className="relative h-full overflow-hidden rounded-3xl bg-white p-8 shadow-md transition-all duration-300 hover:shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mb-6">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Secure Smart Contracts</h3>
              <p className="text-gray-600">
                Get your smart contracts audited by security experts to identify vulnerabilities before they can be exploited.
              </p>
              <div className="mt-6">
                <Link href="/audit/create" className="text-indigo-600 hover:text-indigo-500 font-medium">
                  Create an Audit &rarr;
                </Link>
              </div>
            </div>
          </HighlighterItem>
          
          <HighlighterItem className="group">
            <div className="relative h-full overflow-hidden rounded-3xl bg-white p-8 shadow-md transition-all duration-300 hover:shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mb-6">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Find Vulnerabilities</h3>
              <p className="text-gray-600">
                Browse open audits and earn rewards by finding security vulnerabilities in smart contracts.
              </p>
              <div className="mt-6">
                <Link href="/audits" className="text-indigo-600 hover:text-indigo-500 font-medium">
                  Explore Audits &rarr;
                </Link>
              </div>
            </div>
          </HighlighterItem>
          
          <HighlighterItem className="group">
            <div className="relative h-full overflow-hidden rounded-3xl bg-white p-8 shadow-md transition-all duration-300 hover:shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mb-6">
                <Wallet className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Secure Payments</h3>
              <p className="text-gray-600">
                Funds are securely held in escrow on the Solana blockchain and released only for valid findings.
              </p>
              <div className="mt-6">
                <Link href="/about" className="text-indigo-600 hover:text-indigo-500 font-medium">
                  Learn More &rarr;
                </Link>
              </div>
            </div>
          </HighlighterItem>
        </HighlightGroup>
      </div>
    </div>
  );
} 