/**
 * AuroraBackground
 * Floating violet/blue glow orbs + grid for the app shell.
 * Pure CSS animations — lightweight, no JS animation loop.
 */
export function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(hsl(258 90% 66% / 0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Soft top vignette */}
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />

      {/* Floating aurora orbs */}
      <div
        className="aurora-orb animate-float-slow"
        style={{
          top: "-10%",
          left: "10%",
          width: "560px",
          height: "560px",
          background: "radial-gradient(circle, hsl(258 90% 60% / 0.55), transparent 70%)",
        }}
      />
      <div
        className="aurora-orb animate-float-slower"
        style={{
          top: "30%",
          right: "-8%",
          width: "520px",
          height: "520px",
          background: "radial-gradient(circle, hsl(220 95% 55% / 0.45), transparent 70%)",
        }}
      />
      <div
        className="aurora-orb animate-float-slow"
        style={{
          bottom: "-12%",
          left: "30%",
          width: "640px",
          height: "640px",
          background: "radial-gradient(circle, hsl(280 90% 60% / 0.35), transparent 70%)",
          animationDelay: "-8s",
        }}
      />

      {/* Floating particles */}
      {Array.from({ length: 12 }).map((_, i) => {
        const left = (i * 8.7) % 100;
        const delay = (i * 1.7) % 18;
        const duration = 18 + (i % 5) * 4;
        const size = 2 + (i % 3);
        return (
          <span
            key={i}
            className="absolute rounded-full bg-primary/60"
            style={{
              left: `${left}%`,
              bottom: "-10px",
              width: `${size}px`,
              height: `${size}px`,
              animation: `drift ${duration}s linear ${delay}s infinite`,
              boxShadow: "0 0 8px hsl(258 90% 66% / 0.8)",
            }}
          />
        );
      })}
    </div>
  );
}
