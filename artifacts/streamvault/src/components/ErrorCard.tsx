import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface ErrorCardProps {
  title?: string;
  message: string;
}

export default function ErrorCard({ title = 'Error Analyzing URL', message }: ErrorCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-2xl mx-auto mt-12 p-6 glassmorphism border-l-4 border-l-primary rounded-2xl flex items-start gap-4"
    >
      <div className="mt-1 text-primary">
        <AlertCircle size={24} />
      </div>
      <div>
        <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
        <p className="text-white/70 leading-relaxed">{message}</p>
      </div>
    </motion.div>
  );
}
