import { Library } from "./features/library/Library";
import { PlayerBar } from "./features/player/PlayerBar";
import { PlayerProvider } from "./player/PlayerProvider";
import "./App.css";

export function App() {
  return (
    <PlayerProvider>
      <div className="app">
        <header className="app__head">
          {/* The serif is reserved for this and the now-playing title. */}
          <h1 className="wordmark">
            Spo<em>time</em>
          </h1>
        </header>
        <Library />
      </div>
      <PlayerBar />
    </PlayerProvider>
  );
}
