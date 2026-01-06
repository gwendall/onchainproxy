const repoUrl = "https://github.com/gwendall/onchainproxy";

export const Footer = () => {
  return (
    <footer className="text-foreground-muted py-6 px-4 text-center">
      Made by{" "}
      <a
        href="https://gwendall.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-link hover:underline font-bold"
      >
        Gwendall
      </a>
      .{" "}
      <a
        href={repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-link hover:underline font-bold"
      >
        Open source
      </a>{" "}
      <span className="text-foreground-faint">(MIT License)</span>.
    </footer>
  );
};

