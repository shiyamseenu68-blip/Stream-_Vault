import { motion } from 'framer-motion';
import { Info, Shield, Zap, Heart } from 'lucide-react';
import { Link } from 'wouter';

export default function About() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-6 border border-primary/20 shadow-[0_0_40px_rgba(229,9,20,0.15)]">
          <Info size={40} />
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">About StreamVault</h1>
        <p className="text-xl text-white/50 max-w-2xl mx-auto font-light">
          A premium, no-compromise utility for archiving your favorite YouTube content in the highest quality available.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-6 mb-16">
        {[
          {
            icon: <Zap size={24} />,
            title: "Lightning Fast",
            desc: "Built on a modern stack, our extraction engine analyzes and prepares your downloads in milliseconds, not seconds."
          },
          {
            icon: <Shield size={24} />,
            title: "Secure & Private",
            desc: "No registration required. We don't track what you download. Your activity stays entirely on your device."
          },
          {
            icon: <Heart size={24} />,
            title: "Crafted Interface",
            desc: "We believe utility software shouldn't look like utility software. Every pixel is designed for a premium experience."
          },
          {
            icon: <Info size={24} />,
            title: "Open Technology",
            desc: "Powered by yt-dlp and modern web technologies to ensure reliable extraction even when YouTube changes its layout."
          }
        ].map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            className="glassmorphism p-8 rounded-3xl border border-white/5 hover:border-white/10 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white mb-6">
              {feature.icon}
            </div>
            <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
            <p className="text-white/50 leading-relaxed">
              {feature.desc}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="glassmorphism p-8 md:p-12 rounded-3xl border border-primary/20 bg-primary/5 text-center"
      >
        <h2 className="text-2xl font-bold text-white mb-4">Disclaimer</h2>
        <p className="text-white/60 mb-8 max-w-2xl mx-auto leading-relaxed">
          StreamVault is intended for downloading public domain, creative commons, or your own content. 
          Please respect copyright laws and the terms of service of the platforms you download from. 
          Do not download copyrighted material without permission from the owner.
        </p>
        <Link 
          href="/"
          className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-colors active:scale-95"
        >
          Start Downloading
        </Link>
      </motion.div>
    </div>
  );
}
