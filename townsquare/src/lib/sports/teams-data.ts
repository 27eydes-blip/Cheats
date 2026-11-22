/**
 * Team reference data: league, abbreviation, city, name, primary and secondary
 * colors. Names and colors only (facts, not artwork); logos come from a
 * licensed provider or the Control Room, with a generated badge as fallback.
 * Colors are the clubs' published primary/secondary values where known;
 * spot-check against the club's brand guide before using them in print.
 */
export const LEAGUES = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "MLS", "EPL"] as const;
export type League = (typeof LEAGUES)[number];
export const LEAGUE_NAME: Record<League, string> = { NFL: "NFL", NBA: "NBA", MLB: "MLB", NHL: "NHL", NCAAF: "College Football", MLS: "MLS", EPL: "Premier League" };

type Row = [abbr: string, city: string, name: string, primary: string, secondary: string];

export const TEAM_ROWS: Record<League, Row[]> = {
  NFL: [
    ["ARI", "Arizona", "Cardinals", "#97233F", "#FFB612"], ["ATL", "Atlanta", "Falcons", "#A71930", "#000000"], ["BAL", "Baltimore", "Ravens", "#241773", "#9E7C0C"],
    ["BUF", "Buffalo", "Bills", "#00338D", "#C60C30"], ["CAR", "Carolina", "Panthers", "#0085CA", "#101820"], ["CHI", "Chicago", "Bears", "#0B162A", "#C83803"],
    ["CIN", "Cincinnati", "Bengals", "#FB4F14", "#000000"], ["CLE", "Cleveland", "Browns", "#311D00", "#FF3C00"], ["DAL", "Dallas", "Cowboys", "#003594", "#869397"],
    ["DEN", "Denver", "Broncos", "#FB4F14", "#002244"], ["DET", "Detroit", "Lions", "#0076B6", "#B0B7BC"], ["GB", "Green Bay", "Packers", "#203731", "#FFB612"],
    ["HOU", "Houston", "Texans", "#03202F", "#A71930"], ["IND", "Indianapolis", "Colts", "#002C5F", "#A2AAAD"], ["JAX", "Jacksonville", "Jaguars", "#006778", "#D7A22A"],
    ["KC", "Kansas City", "Chiefs", "#E31837", "#FFB81C"], ["LV", "Las Vegas", "Raiders", "#000000", "#A5ACAF"], ["LAC", "Los Angeles", "Chargers", "#0080C6", "#FFC20E"],
    ["LAR", "Los Angeles", "Rams", "#003594", "#FFA300"], ["MIA", "Miami", "Dolphins", "#008E97", "#FC4C02"], ["MIN", "Minnesota", "Vikings", "#4F2683", "#FFC62F"],
    ["NE", "New England", "Patriots", "#002244", "#C60C30"], ["NO", "New Orleans", "Saints", "#101820", "#D3BC8D"], ["NYG", "New York", "Giants", "#0B2265", "#A71930"],
    ["NYJ", "New York", "Jets", "#125740", "#FFFFFF"], ["PHI", "Philadelphia", "Eagles", "#004C54", "#A5ACAF"], ["PIT", "Pittsburgh", "Steelers", "#101820", "#FFB612"],
    ["SF", "San Francisco", "49ers", "#AA0000", "#B3995D"], ["SEA", "Seattle", "Seahawks", "#002244", "#69BE28"], ["TB", "Tampa Bay", "Buccaneers", "#D50A0A", "#34302B"],
    ["TEN", "Tennessee", "Titans", "#0C2340", "#4B92DB"], ["WAS", "Washington", "Commanders", "#5A1414", "#FFB612"],
  ],
  NBA: [
    ["ATL", "Atlanta", "Hawks", "#E03A3E", "#C1D32F"], ["BOS", "Boston", "Celtics", "#007A33", "#BA9653"], ["BKN", "Brooklyn", "Nets", "#000000", "#FFFFFF"],
    ["CHA", "Charlotte", "Hornets", "#1D1160", "#00788C"], ["CHI", "Chicago", "Bulls", "#CE1141", "#000000"], ["CLE", "Cleveland", "Cavaliers", "#860038", "#FDBB30"],
    ["DAL", "Dallas", "Mavericks", "#00538C", "#002B5E"], ["DEN", "Denver", "Nuggets", "#0E2240", "#FEC524"], ["DET", "Detroit", "Pistons", "#C8102E", "#1D42BA"],
    ["GSW", "Golden State", "Warriors", "#1D428A", "#FFC72C"], ["HOU", "Houston", "Rockets", "#CE1141", "#000000"], ["IND", "Indiana", "Pacers", "#002D62", "#FDBB30"],
    ["LAC", "LA", "Clippers", "#C8102E", "#1D428A"], ["LAL", "Los Angeles", "Lakers", "#552583", "#FDB927"], ["MEM", "Memphis", "Grizzlies", "#5D76A9", "#12173F"],
    ["MIA", "Miami", "Heat", "#98002E", "#F9A01B"], ["MIL", "Milwaukee", "Bucks", "#00471B", "#EEE1C6"], ["MIN", "Minnesota", "Timberwolves", "#0C2340", "#236192"],
    ["NOP", "New Orleans", "Pelicans", "#0C2340", "#C8102E"], ["NYK", "New York", "Knicks", "#006BB6", "#F58426"], ["OKC", "Oklahoma City", "Thunder", "#007AC1", "#EF3B24"],
    ["ORL", "Orlando", "Magic", "#0077C0", "#C4CED4"], ["PHI", "Philadelphia", "76ers", "#006BB6", "#ED174C"], ["PHX", "Phoenix", "Suns", "#1D1160", "#E56020"],
    ["POR", "Portland", "Trail Blazers", "#E03A3E", "#000000"], ["SAC", "Sacramento", "Kings", "#5A2D81", "#63727A"], ["SAS", "San Antonio", "Spurs", "#000000", "#C4CED4"],
    ["TOR", "Toronto", "Raptors", "#CE1141", "#000000"], ["UTA", "Utah", "Jazz", "#002B5C", "#F9A01B"], ["WAS", "Washington", "Wizards", "#002B5C", "#E31837"],
  ],
  MLB: [
    ["ARI", "Arizona", "Diamondbacks", "#A71930", "#E3D4AD"], ["ATL", "Atlanta", "Braves", "#CE1141", "#13274F"], ["BAL", "Baltimore", "Orioles", "#DF4601", "#000000"],
    ["BOS", "Boston", "Red Sox", "#BD3039", "#0C2340"], ["CHC", "Chicago", "Cubs", "#0E3386", "#CC3433"], ["CWS", "Chicago", "White Sox", "#27251F", "#C4CED4"],
    ["CIN", "Cincinnati", "Reds", "#C6011F", "#000000"], ["CLE", "Cleveland", "Guardians", "#00385D", "#E50022"], ["COL", "Colorado", "Rockies", "#333366", "#C4CED4"],
    ["DET", "Detroit", "Tigers", "#0C2340", "#FA4616"], ["HOU", "Houston", "Astros", "#002D62", "#EB6E1F"], ["KC", "Kansas City", "Royals", "#004687", "#BD9B60"],
    ["LAA", "Los Angeles", "Angels", "#BA0021", "#003263"], ["LAD", "Los Angeles", "Dodgers", "#005A9C", "#EF3E42"], ["MIA", "Miami", "Marlins", "#00A3E0", "#EF3340"],
    ["MIL", "Milwaukee", "Brewers", "#12284B", "#FFC52F"], ["MIN", "Minnesota", "Twins", "#002B5C", "#D31145"], ["NYM", "New York", "Mets", "#002D72", "#FF5910"],
    ["NYY", "New York", "Yankees", "#0C2340", "#C4CED3"], ["ATH", "Sacramento", "Athletics", "#003831", "#EFB21E"], ["PHI", "Philadelphia", "Phillies", "#E81828", "#002D72"],
    ["PIT", "Pittsburgh", "Pirates", "#27251F", "#FDB827"], ["SD", "San Diego", "Padres", "#2F241D", "#FFC425"], ["SF", "San Francisco", "Giants", "#FD5A1E", "#27251F"],
    ["SEA", "Seattle", "Mariners", "#0C2C56", "#005C5C"], ["STL", "St. Louis", "Cardinals", "#C41E3A", "#0C2340"], ["TB", "Tampa Bay", "Rays", "#092C5C", "#8FBCE6"],
    ["TEX", "Texas", "Rangers", "#003278", "#C0111F"], ["TOR", "Toronto", "Blue Jays", "#134A8E", "#1D2D5C"], ["WSH", "Washington", "Nationals", "#AB0003", "#14225A"],
  ],
  NHL: [
    ["ANA", "Anaheim", "Ducks", "#F47A38", "#000000"], ["BOS", "Boston", "Bruins", "#FFB81C", "#000000"], ["BUF", "Buffalo", "Sabres", "#003087", "#FFB81C"],
    ["CGY", "Calgary", "Flames", "#C8102E", "#F1BE48"], ["CAR", "Carolina", "Hurricanes", "#CC0000", "#000000"], ["CHI", "Chicago", "Blackhawks", "#CF0A2C", "#000000"],
    ["COL", "Colorado", "Avalanche", "#6F263D", "#236192"], ["CBJ", "Columbus", "Blue Jackets", "#002654", "#CE1126"], ["DAL", "Dallas", "Stars", "#006847", "#8F8F8C"],
    ["DET", "Detroit", "Red Wings", "#CE1126", "#FFFFFF"], ["EDM", "Edmonton", "Oilers", "#041E42", "#FF4C00"], ["FLA", "Florida", "Panthers", "#041E42", "#C8102E"],
    ["LAK", "Los Angeles", "Kings", "#111111", "#A2AAAD"], ["MIN", "Minnesota", "Wild", "#154734", "#A6192E"], ["MTL", "Montréal", "Canadiens", "#AF1E2D", "#192168"],
    ["NSH", "Nashville", "Predators", "#FFB81C", "#041E42"], ["NJD", "New Jersey", "Devils", "#CE1126", "#000000"], ["NYI", "New York", "Islanders", "#00539B", "#F47D30"],
    ["NYR", "New York", "Rangers", "#0038A8", "#CE1126"], ["OTT", "Ottawa", "Senators", "#C52032", "#C2912C"], ["PHI", "Philadelphia", "Flyers", "#F74902", "#000000"],
    ["PIT", "Pittsburgh", "Penguins", "#000000", "#FCB514"], ["SJS", "San Jose", "Sharks", "#006D75", "#EA7200"], ["SEA", "Seattle", "Kraken", "#001628", "#99D9D9"],
    ["STL", "St. Louis", "Blues", "#002F87", "#FCB514"], ["TBL", "Tampa Bay", "Lightning", "#002868", "#FFFFFF"], ["TOR", "Toronto", "Maple Leafs", "#00205B", "#FFFFFF"],
    ["UTA", "Utah", "Mammoth", "#010101", "#6CACE4"], ["VAN", "Vancouver", "Canucks", "#00205B", "#00843D"], ["VGK", "Vegas", "Golden Knights", "#B4975A", "#333F42"],
    ["WSH", "Washington", "Capitals", "#C8102E", "#041E42"], ["WPG", "Winnipeg", "Jets", "#041E42", "#004C97"],
  ],
  NCAAF: [
    ["ALA", "Alabama", "Crimson Tide", "#9E1B32", "#828A8F"], ["ARK", "Arkansas", "Razorbacks", "#9D2235", "#FFFFFF"], ["ASU", "Arizona State", "Sun Devils", "#8C1D40", "#FFC627"],
    ["AUB", "Auburn", "Tigers", "#0C2340", "#E87722"], ["BAY", "Baylor", "Bears", "#154734", "#FFB81C"], ["BOIS", "Boise State", "Broncos", "#0033A0", "#D64309"],
    ["BYU", "BYU", "Cougars", "#002E5D", "#FFFFFF"], ["CLEM", "Clemson", "Tigers", "#F56600", "#522D80"], ["COLO", "Colorado", "Buffaloes", "#CFB87C", "#000000"],
    ["FLA", "Florida", "Gators", "#0021A5", "#FA4616"], ["FSU", "Florida State", "Seminoles", "#782F40", "#CEB888"], ["UGA", "Georgia", "Bulldogs", "#BA0C2F", "#000000"],
    ["ILL", "Illinois", "Fighting Illini", "#E84A27", "#13294B"], ["IOWA", "Iowa", "Hawkeyes", "#FFCD00", "#000000"], ["KSU", "Kansas State", "Wildcats", "#512888", "#A7A7A7"],
    ["UK", "Kentucky", "Wildcats", "#0033A0", "#FFFFFF"], ["LOU", "Louisville", "Cardinals", "#AD0000", "#000000"], ["LSU", "LSU", "Tigers", "#461D7C", "#FDD023"],
    ["MIA", "Miami", "Hurricanes", "#F47321", "#005030"], ["MICH", "Michigan", "Wolverines", "#00274C", "#FFCB05"], ["MSU", "Michigan State", "Spartans", "#18453B", "#FFFFFF"],
    ["MINN", "Minnesota", "Golden Gophers", "#7A0019", "#FFCC33"], ["MISS", "Ole Miss", "Rebels", "#CE1126", "#14213D"], ["MSST", "Mississippi State", "Bulldogs", "#660000", "#FFFFFF"],
    ["MIZ", "Missouri", "Tigers", "#F1B82D", "#000000"], ["NEB", "Nebraska", "Cornhuskers", "#E41C38", "#FDF2D9"], ["UNC", "North Carolina", "Tar Heels", "#7BAFD4", "#13294B"],
    ["ND", "Notre Dame", "Fighting Irish", "#0C2340", "#C99700"], ["OSU", "Ohio State", "Buckeyes", "#BB0000", "#666666"], ["OU", "Oklahoma", "Sooners", "#841617", "#FDF9D8"],
    ["OKST", "Oklahoma State", "Cowboys", "#FF7300", "#000000"], ["ORE", "Oregon", "Ducks", "#154733", "#FEE123"], ["PSU", "Penn State", "Nittany Lions", "#041E42", "#FFFFFF"],
    ["SMU", "SMU", "Mustangs", "#0033A0", "#CC0035"], ["SC", "South Carolina", "Gamecocks", "#73000A", "#000000"], ["TCU", "TCU", "Horned Frogs", "#4D1979", "#A3A9AC"],
    ["TENN", "Tennessee", "Volunteers", "#FF8200", "#58595B"], ["TEX", "Texas", "Longhorns", "#BF5700", "#333F48"], ["TAMU", "Texas A&M", "Aggies", "#500000", "#FFFFFF"],
    ["UCLA", "UCLA", "Bruins", "#2D68C4", "#F2A900"], ["USC", "USC", "Trojans", "#990000", "#FFC72C"], ["UTAH", "Utah", "Utes", "#CC0000", "#000000"],
    ["VAN", "Vanderbilt", "Commodores", "#000000", "#866D4B"], ["VT", "Virginia Tech", "Hokies", "#630031", "#CF4420"], ["WASH", "Washington", "Huskies", "#4B2E83", "#B7A57A"],
    ["WIS", "Wisconsin", "Badgers", "#C5050C", "#FFFFFF"],
    ["ARST", "Arkansas State", "Red Wolves", "#CC092F", "#000000"], ["LT", "Louisiana Tech", "Bulldogs", "#002F8B", "#E31B23"], ["CSU", "Colorado State", "Rams", "#1E4D2B", "#C8C372"],
    ["FRES", "Fresno State", "Bulldogs", "#DB0032", "#002E6D"], ["UTSA", "UTSA", "Roadrunners", "#0C2340", "#F15A22"], ["MOH", "Miami (OH)", "RedHawks", "#C3142D", "#000000"],
  ],
  MLS: [
    ["ATL", "Atlanta", "Atlanta United", "#80000A", "#221F1F"], ["ATX", "Austin", "Austin FC", "#00B140", "#000000"], ["CLT", "Charlotte", "Charlotte FC", "#1A85C8", "#000000"],
    ["CHI", "Chicago", "Chicago Fire FC", "#9A1B2F", "#102141"], ["CIN", "Cincinnati", "FC Cincinnati", "#F05323", "#263B80"], ["COL", "Colorado", "Colorado Rapids", "#960A2C", "#9CC2EA"],
    ["CLB", "Columbus", "Columbus Crew", "#FEDD00", "#000000"], ["DAL", "Dallas", "FC Dallas", "#E81F3E", "#2A4076"], ["DC", "D.C.", "D.C. United", "#000000", "#EF3E42"],
    ["HOU", "Houston", "Houston Dynamo FC", "#FF6B00", "#101820"], ["MIA", "Miami", "Inter Miami CF", "#F7B5CD", "#231F20"], ["LA", "Los Angeles", "LA Galaxy", "#00245D", "#FFD200"],
    ["LAFC", "Los Angeles", "LAFC", "#000000", "#C39E6D"], ["MIN", "Minnesota", "Minnesota United FC", "#231F20", "#8CD2F4"], ["MTL", "Montréal", "CF Montréal", "#000000", "#0033A1"],
    ["NSH", "Nashville", "Nashville SC", "#ECE83A", "#1F1646"], ["NE", "New England", "New England Revolution", "#0A2240", "#CE0E2D"], ["NYC", "New York", "New York City FC", "#6CACE4", "#041E42"],
    ["RBNY", "New York", "New York Red Bulls", "#ED1E36", "#23326A"], ["ORL", "Orlando", "Orlando City SC", "#633492", "#FDE192"], ["PHI", "Philadelphia", "Philadelphia Union", "#071B2C", "#B19B69"],
    ["POR", "Portland", "Portland Timbers", "#004812", "#EBE72B"], ["RSL", "Salt Lake", "Real Salt Lake", "#B30838", "#013A81"], ["SD", "San Diego", "San Diego FC", "#000000", "#6CC1E9"],
    ["SJ", "San Jose", "San Jose Earthquakes", "#0067B1", "#000000"], ["SEA", "Seattle", "Seattle Sounders FC", "#5D9741", "#005595"], ["SKC", "Kansas City", "Sporting Kansas City", "#002F65", "#93B1D7"],
    ["STL", "St. Louis", "St. Louis City SC", "#DD004A", "#001544"], ["TOR", "Toronto", "Toronto FC", "#B81137", "#455560"], ["VAN", "Vancouver", "Vancouver Whitecaps FC", "#00245E", "#9DC2EA"],
  ],
  EPL: [
    ["ARS", "London", "Arsenal", "#EF0107", "#063672"], ["AVL", "Birmingham", "Aston Villa", "#670E36", "#95BFE5"], ["BOU", "Bournemouth", "AFC Bournemouth", "#DA291C", "#000000"],
    ["BRE", "London", "Brentford", "#E30613", "#140E0C"], ["BHA", "Brighton", "Brighton & Hove Albion", "#0057B8", "#FFFFFF"], ["BUR", "Burnley", "Burnley", "#6C1D45", "#99D6EA"],
    ["CHE", "London", "Chelsea", "#034694", "#DBA111"], ["CRY", "London", "Crystal Palace", "#1B458F", "#C4122E"], ["EVE", "Liverpool", "Everton", "#003399", "#FFFFFF"],
    ["FUL", "London", "Fulham", "#000000", "#CC0000"], ["LEE", "Leeds", "Leeds United", "#FFCD00", "#1D428A"], ["LIV", "Liverpool", "Liverpool", "#C8102E", "#00B2A9"],
    ["MCI", "Manchester", "Manchester City", "#6CABDD", "#1C2C5B"], ["MUN", "Manchester", "Manchester United", "#DA291C", "#FBE122"], ["NEW", "Newcastle", "Newcastle United", "#241F20", "#41B6E6"],
    ["NFO", "Nottingham", "Nottingham Forest", "#DD0000", "#FFFFFF"], ["SUN", "Sunderland", "Sunderland", "#EB172B", "#211E1E"], ["TOT", "London", "Tottenham Hotspur", "#132257", "#FFFFFF"],
    ["WHU", "London", "West Ham United", "#7A263A", "#1BB1E7"], ["WOL", "Wolverhampton", "Wolverhampton Wanderers", "#FDB913", "#231F20"],
  ],
};

/** Leagues whose team names already are the full club name. */
export const FULL_NAME_LEAGUES: League[] = ["MLS", "EPL"];
