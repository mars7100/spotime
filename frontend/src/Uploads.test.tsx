/* Adding audio from disk, at the app's network boundary.
   The upload is three steps and the middle one bypasses our server entirely, so
   these tests assert on the requests the browser actually issues and on what a
   person sees when one of them fails. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { song } from "./test/fixtures";
import { givenLibrary, http, HttpResponse, requests, server } from "./test/server";
import type { MediaRecord } from "./api/types";

/* ---------------------------------------------------------------------------
   Files, as the browser hands them over.
   --------------------------------------------------------------------------- */

/** A real ID3v2.3 tag, so the tags under test are read out of actual bytes. */
function mp3With({ title, artist, album }: { title: string; artist: string; album: string }) {
  const text = (id: string, value: string) => {
    const body = [0, ...[...value].map((c) => c.charCodeAt(0))];
    const size = [
      (body.length >> 24) & 0xff,
      (body.length >> 16) & 0xff,
      (body.length >> 8) & 0xff,
      body.length & 0xff,
    ];
    return [...[...id].map((c) => c.charCodeAt(0)), ...size, 0, 0, ...body];
  };
  const frames = [...text("TIT2", title), ...text("TPE1", artist), ...text("TALB", album)];
  // The tag size is stored as four 7-bit "syncsafe" bytes.
  const size = [
    (frames.length >> 21) & 0x7f,
    (frames.length >> 14) & 0x7f,
    (frames.length >> 7) & 0x7f,
    frames.length & 0x7f,
  ];
  return new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, ...size, ...frames]);
}

const audioFile = (name: string, bytes: BlobPart = "audio-bytes") =>
  new File([bytes], name, { type: "audio/mpeg" });

/** What the folder picker sets, and what a dropped folder is made to look like. */
const inFolder = (file: File, path: string) => {
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
};

/* ---------------------------------------------------------------------------
   The server side of the three steps.
   --------------------------------------------------------------------------- */

let minted = 0;

/** The happy path: a target is minted, storage accepts the bytes, the record is
    created. `registered` collects what the app said each file was. */
function givenUploadsAccepted() {
  const registered: Record<string, unknown>[] = [];
  server.use(
    http.post("/api/media/upload-url", async ({ request }) => {
      const body = (await request.json()) as { filename: string; content_type: string };
      minted += 1;
      return HttpResponse.json({
        id: `new${minted}`,
        key: `audio/new${minted}.mp3`,
        url: `/api/local-upload/new${minted}.mp3`,
        method: "PUT",
        headers: { "Content-Type": body.content_type },
      });
    }),
    http.put("/api/local-upload/:name", () => new HttpResponse(null, { status: 200 })),
    http.post("/api/media/register", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      registered.push(body);
      return HttpResponse.json(
        song({ id: body.id as string, title: (body.title as string) ?? (body.filename as string) }),
        { status: 201 },
      );
    }),
  );
  return registered;
}

const pathsOf = () => requests.map((r) => `${r.method} ${r.path}`);

/** The upload's own requests: everything the app did that was not a library read. */
const writesOf = () => requests.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`);

const addFiles = (files: File[]) => userEvent.upload(screen.getByLabelText("Add files"), files);
const addFolder = (files: File[]) => userEvent.upload(screen.getByLabelText("Add folder"), files);

/** The library has to have answered before the upload controls mean anything. */
const appReady = () => screen.findByLabelText("Add files");

/* ---------------------------------------------------------------------------
   Tests
   --------------------------------------------------------------------------- */

describe("uploading a file", () => {
  it("mints a target, sends the bytes straight to storage, then registers it", async () => {
    givenLibrary([]);
    givenUploadsAccepted();
    render(<App />);
    await appReady();

    await addFiles([audioFile("nightcall.mp3")]);

    await screen.findByText(/Added 1 of 1 file/);
    expect(writesOf()).toEqual([
      "POST /api/media/upload-url",
      "PUT /api/local-upload/new1.mp3",
      "POST /api/media/register",
    ]);
  });

  it("reads title, artist and album out of the file rather than asking for them", async () => {
    givenLibrary([]);
    const registered = givenUploadsAccepted();
    render(<App />);
    await appReady();

    const tagged = mp3With({ title: "Nightcall", artist: "Kavinsky", album: "OutRun" });
    await addFiles([audioFile("track01.mp3", tagged)]);

    await screen.findByText(/Added 1 of 1 file/);
    expect(registered[0]).toMatchObject({
      title: "Nightcall",
      artist: "Kavinsky",
      album: "OutRun",
      filename: "track01.mp3",
      media_type: "music",
    });
  });

  it("shows the file moving, and says when it has landed", async () => {
    givenLibrary([]);
    givenUploadsAccepted();
    render(<App />);
    await appReady();

    await addFiles([audioFile("nightcall.mp3")]);

    await screen.findByRole("progressbar", { name: "Upload progress for nightcall.mp3" });
    expect(screen.getByText("nightcall.mp3")).toBeInTheDocument();
    await screen.findByText("Added");
  });

  it("puts the new track in the library without a reload", async () => {
    const library: MediaRecord[] = [];
    server.use(http.get("/api/media", () => HttpResponse.json(library)));
    server.use(
      http.post("/api/media/upload-url", () =>
        HttpResponse.json({
          id: "fresh",
          key: "audio/fresh.mp3",
          url: "/api/local-upload/fresh.mp3",
          method: "PUT",
          headers: { "Content-Type": "audio/mpeg" },
        }),
      ),
      http.put("/api/local-upload/:name", () => new HttpResponse(null, { status: 200 })),
      http.post("/api/media/register", () => {
        const record = song({ id: "fresh", title: "Tadow" });
        library.push(record);
        return HttpResponse.json(record, { status: 201 });
      }),
    );
    render(<App />);
    await appReady();

    await addFiles([audioFile("tadow.mp3")]);

    await waitFor(() => expect(screen.getByText("Tadow")).toBeInTheDocument());
  });
});

describe("uploading a folder", () => {
  it("makes one book of it, with its chapters numbered in order", async () => {
    givenLibrary([]);
    const registered = givenUploadsAccepted();
    render(<App />);
    await appReady();

    await addFolder([
      inFolder(audioFile("ch10.mp3"), "Project Hail Mary/ch10.mp3"),
      inFolder(audioFile("ch2.mp3"), "Project Hail Mary/ch2.mp3"),
    ]);

    await screen.findByText(/Added 2 of 2 files/);
    expect(registered.map((r) => [r.filename, r.media_type, r.book_title, r.track_number])).toEqual([
      ["ch2.mp3", "audiobook", "Project Hail Mary", 1],
      ["ch10.mp3", "audiobook", "Project Hail Mary", 2],
    ]);
    // One book, not two records that happen to share a name.
    expect(new Set(registered.map((r) => r.book_id)).size).toBe(1);
  });

  it("adds chapters to the book already in the library instead of a second copy", async () => {
    givenLibrary([
      song({
        title: "Chapter 1",
        original_filename: "ch1.mp3",
        book_id: "book-existing",
        book_title: "Project Hail Mary",
      }),
    ]);
    const registered = givenUploadsAccepted();
    render(<App />);
    await appReady();

    await addFolder([
      inFolder(audioFile("ch1.mp3"), "Project Hail Mary/ch1.mp3"),
      inFolder(audioFile("ch2.mp3"), "Project Hail Mary/ch2.mp3"),
    ]);

    await screen.findByText(/Added 1 of 1 file/);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ filename: "ch2.mp3", book_id: "book-existing" });
  });
});

describe("a file already in the library", () => {
  it("is recognised and never uploaded again", async () => {
    givenLibrary([song({ title: "Nightcall", original_filename: "nightcall.mp3" })]);
    givenUploadsAccepted();
    render(<App />);
    await appReady();

    await addFiles([audioFile("nightcall.mp3")]);

    await screen.findByText(/Already in your library/);
    expect(pathsOf()).not.toContain("POST /api/media/upload-url");
  });
});

describe("a failure", () => {
  const failAt = (path: string) =>
    server.use(http.post(path, () => new HttpResponse("no", { status: 500 })));

  it("names the step when the upload target cannot be minted", async () => {
    givenLibrary([]);
    givenUploadsAccepted();
    failAt("/api/media/upload-url");
    render(<App />);
    await appReady();

    await addFiles([audioFile("nightcall.mp3")]);

    expect(await screen.findByText(/couldn’t start the upload/)).toHaveTextContent("nightcall.mp3");
  });

  it("names the step when storage rejects the bytes", async () => {
    givenLibrary([]);
    givenUploadsAccepted();
    server.use(http.put("/api/local-upload/:name", () => new HttpResponse(null, { status: 500 })));
    render(<App />);
    await appReady();

    await addFiles([audioFile("nightcall.mp3")]);

    expect(await screen.findByText(/couldn’t send the file to storage/)).toHaveTextContent(
      "nightcall.mp3",
    );
  });

  it("names the step when the record cannot be registered", async () => {
    givenLibrary([]);
    givenUploadsAccepted();
    failAt("/api/media/register");
    render(<App />);
    await appReady();

    await addFiles([audioFile("nightcall.mp3")]);

    expect(await screen.findByText(/couldn’t add it to your library/)).toHaveTextContent(
      "nightcall.mp3",
    );
  });

  it("keeps going after one file fails, and says how the batch ended", async () => {
    givenLibrary([]);
    givenUploadsAccepted();
    let attempt = 0;
    server.use(
      http.put("/api/local-upload/:name", () => {
        attempt += 1;
        return new HttpResponse(null, { status: attempt === 1 ? 500 : 200 });
      }),
    );
    render(<App />);
    await appReady();

    await addFiles([audioFile("one.mp3"), audioFile("two.mp3")]);

    await screen.findByText(/Added 1 of 2 files · 1 failure/);
  });
});

describe("dragging onto the window", () => {
  /** jsdom has no DataTransfer; this is the shape the app actually reads. */
  const dragEvent = (type: string, files: File[]) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["Files"], items: [], files },
    });
    return event;
  };

  it("shows a drop target while files are over the window", async () => {
    givenLibrary([]);
    render(<App />);
    await appReady();

    window.dispatchEvent(dragEvent("dragover", []));

    expect(await screen.findByText(/Drop audio files or a folder/)).toBeInTheDocument();
  });

  it("uploads what is dropped", async () => {
    givenLibrary([]);
    const registered = givenUploadsAccepted();
    render(<App />);
    await appReady();

    window.dispatchEvent(dragEvent("drop", [audioFile("nightcall.mp3")]));

    await screen.findByText(/Added 1 of 1 file/);
    expect(registered[0]).toMatchObject({ filename: "nightcall.mp3" });
  });
});

describe("a selection with nothing to upload", () => {
  it("says so rather than starting a batch", async () => {
    givenLibrary([]);
    render(<App />);
    await appReady();

    await addFiles([new File(["x"], "cover.jpg", { type: "image/jpeg" })]);

    expect(await screen.findByText("No audio files in that selection.")).toBeInTheDocument();
    expect(pathsOf()).not.toContain("POST /api/media/upload-url");
  });
});
