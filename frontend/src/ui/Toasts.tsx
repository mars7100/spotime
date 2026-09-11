import { useEffect, useState } from "react";
import { onToast } from "./toast";
import "./toast.css";

/** The live region stays mounted so screen readers announce what lands in it;
    visibility is CSS on `data-shown`. */
export function Toasts() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const stop = onToast((next) => {
      setMessage(next);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), 3000);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="toast" role="status" aria-live="polite" data-shown={message != null}>
      {message}
    </div>
  );
}
