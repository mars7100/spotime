/* The icon set.
   Every icon in the app comes from here, so weight and size stay uniform — the
   old client mixed emoji (full-colour on macOS, flat on Android) with
   box-drawing glyphs standing in for a pause button. */
import {
  BookOpen,
  Check,
  ChevronDown,
  Download,
  Gauge,
  ListMusic,
  Loader2,
  MoreHorizontal,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Tag,
  Trash2,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
  X,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";

export const ICON_SIZE = 18;
export const ICON_STROKE = 1.75;

export type IconProps = Omit<LucideProps, "size" | "strokeWidth"> & {
  size?: number;
};

/** Binds one lucide icon to the set's size and stroke weight. */
function icon(Source: ComponentType<LucideProps>, name: string) {
  const Bound = ({ size = ICON_SIZE, ...rest }: IconProps) => (
    <Source size={size} strokeWidth={ICON_STROKE} aria-hidden {...rest} />
  );
  Bound.displayName = `Icon(${name})`;
  return Bound;
}

export const IconPlay = icon(Play, "Play");
export const IconPause = icon(Pause, "Pause");
export const IconPrev = icon(SkipBack, "Prev");
export const IconNext = icon(SkipForward, "Next");
export const IconShuffle = icon(Shuffle, "Shuffle");
export const IconBack15 = icon(RotateCcw, "Back15");
export const IconForward30 = icon(RotateCw, "Forward30");
export const IconSpeed = icon(Gauge, "Speed");
export const IconVolumeMute = icon(VolumeX, "VolumeMute");
export const IconVolumeLow = icon(Volume1, "VolumeLow");
export const IconVolumeHigh = icon(Volume2, "VolumeHigh");
export const IconCollapse = icon(ChevronDown, "Collapse");
export const IconMore = icon(MoreHorizontal, "More");
export const IconClose = icon(X, "Close");
export const IconSearch = icon(Search, "Search");
export const IconTag = icon(Tag, "Tag");
export const IconPlus = icon(Plus, "Plus");
export const IconCheck = icon(Check, "Check");
export const IconTrash = icon(Trash2, "Trash");
export const IconUpload = icon(Upload, "Upload");
export const IconDownload = icon(Download, "Download");
export const IconChapters = icon(ListMusic, "Chapters");
export const IconMusic = icon(Music, "Music");
export const IconBook = icon(BookOpen, "Book");
export const IconSpinner = icon(Loader2, "Spinner");
