import { BellIcon, ClockIcon, CommunityIcon, CompassIcon, EditionIcon, HelpIcon, HomeIcon, LayersIcon, MessageIcon, MicIcon, RundownIcon, SaveIcon, SettingsIcon, ShieldIcon, SparkIcon, TeamsIcon, TrendIcon, UserIcon, WalletIcon } from "../icons";
import type { MenuIcon } from "./menu";

const MAP: Record<MenuIcon, (p: { size?: number; strokeWidth?: number }) => React.ReactNode> = {
  profile: UserIcon, vault: SaveIcon, history: ClockIcon, lists: LayersIcon, rooms: MicIcon, groups: CommunityIcon, markets: TrendIcon, creator: SparkIcon,
  wallet: WalletIcon, settings: SettingsIcon, help: HelpIcon, rundown: RundownIcon, edition: EditionIcon, teams: TeamsIcon, control: ShieldIcon,
  home: HomeIcon, discover: CompassIcon, alerts: BellIcon, messages: MessageIcon,
};

export function MenuGlyph({ name, size = 22, strong }: { name: MenuIcon; size?: number; strong?: boolean }) {
  const I = MAP[name];
  return <I size={size} strokeWidth={strong ? 2.1 : 1.7} />;
}
