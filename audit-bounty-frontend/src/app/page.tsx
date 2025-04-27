import Link from 'next/link';
import { MainLayout } from "@/components/layout/MainLayout";
import { Hero } from '@/components/Hero';
import { FeatureCards } from '@/components/FeatureCards';
import { Particles } from '@/components/ui/particles';
import { GridPattern } from '@/components/ui/grid-pattern';
import { FeaturedAuditors } from '@/components/home/FeaturedAuditors';
import { GlobalAuditMap } from '@/components/home/GlobalAuditMap';

export default function Home() {
  return (
    <MainLayout>
      <div className="relative overflow-hidden min-h-[600px]">
        {/* Grid pattern behind the hero */}
        <GridPattern 
          className="absolute inset-0 -z-10 opacity-80"
          width={32} 
          height={32} 
          strokeDasharray="2 2"
        />
        
        {/* Particles effect */}
        <Particles 
          className="absolute inset-0 -z-10" 
          quantity={100}
          staticity={30}
          color="#6366f1"
        />
        
        <Hero />
      </div>
      
      <FeatureCards />
      
      <FeaturedAuditors />
      
      <GlobalAuditMap />
    </MainLayout>
  );
}
