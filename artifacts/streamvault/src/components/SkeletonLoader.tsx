import { motion } from 'framer-motion';

export default function SkeletonLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-4xl mx-auto mt-12 grid grid-cols-1 md:grid-cols-12 gap-8"
    >
      {/* Thumbnail Skeleton */}
      <div className="md:col-span-5 aspect-video rounded-2xl bg-white/5 animate-pulse border border-white/10"></div>
      
      {/* Content Skeleton */}
      <div className="md:col-span-7 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="h-8 w-3/4 bg-white/5 rounded-lg animate-pulse"></div>
          <div className="h-6 w-1/2 bg-white/5 rounded-lg animate-pulse"></div>
        </div>
        
        <div className="flex gap-4">
          <div className="h-10 w-10 rounded-full bg-white/5 animate-pulse"></div>
          <div className="flex flex-col gap-2 justify-center">
            <div className="h-4 w-32 bg-white/5 rounded animate-pulse"></div>
            <div className="h-3 w-24 bg-white/5 rounded animate-pulse"></div>
          </div>
        </div>
        
        <div className="flex gap-4 mt-auto">
          <div className="flex-1 h-16 rounded-2xl bg-white/5 animate-pulse"></div>
          <div className="flex-1 h-16 rounded-2xl bg-white/5 animate-pulse"></div>
        </div>
      </div>
    </motion.div>
  );
}
