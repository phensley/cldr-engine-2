import { deflateSync } from 'zlib';
import { decodeX85GVE16 } from '../../src/binary/decode.js';
import { encodeGVE16, encodeX85 } from '../../src/binary/encode.js';
import { addKey, newTrie } from '../../src/trie/build.js';
import { encodeTrie } from '../../src/trie/encode.js';

// test('foo', () => {
//   const nums = [65535, 65535, 65535];
//   const u16 = new Uint16Array(nums);
//   const enc = x8516Encode(u16);
//   const dec = x8516Decode(enc);
//   expect(dec).toEqual(u16);
// });

const elapsed = (time: [number, number]) => time[0] * 1000 + time[1] / 1e6;

test('round-trip', () => {
  const ZONES =
    'Africa/Abidjan|Africa/Algiers|Africa/Bissau|Africa/Cairo|Africa/Casablanca|Africa/Ceuta|Africa/El_Aaiun|Africa/Johannesburg|Africa/Juba|Africa/Khartoum|Africa/Lagos|Africa/Maputo|Africa/Monrovia|Africa/Nairobi|Africa/Ndjamena|Africa/Sao_Tome|Africa/Tripoli|Africa/Tunis|Africa/Windhoek|America/Adak|America/Anchorage|America/Araguaina|America/Argentina/Buenos_Aires|America/Argentina/Catamarca|America/Argentina/Cordoba|America/Argentina/Jujuy|America/Argentina/La_Rioja|America/Argentina/Mendoza|America/Argentina/Rio_Gallegos|America/Argentina/Salta|America/Argentina/San_Juan|America/Argentina/San_Luis|America/Argentina/Tucuman|America/Argentina/Ushuaia|America/Asuncion|America/Bahia|America/Bahia_Banderas|America/Barbados|America/Belem|America/Belize|America/Boa_Vista|America/Bogota|America/Boise|America/Cambridge_Bay|America/Campo_Grande|America/Cancun|America/Caracas|America/Cayenne|America/Chicago|America/Chihuahua|America/Ciudad_Juarez|America/Costa_Rica|America/Coyhaique|America/Cuiaba|America/Danmarkshavn|America/Dawson|America/Dawson_Creek|America/Denver|America/Detroit|America/Edmonton|America/Eirunepe|America/El_Salvador|America/Fort_Nelson|America/Fortaleza|America/Glace_Bay|America/Goose_Bay|America/Grand_Turk|America/Guatemala|America/Guayaquil|America/Guyana|America/Halifax|America/Havana|America/Hermosillo|America/Indiana/Indianapolis|America/Indiana/Knox|America/Indiana/Marengo|America/Indiana/Petersburg|America/Indiana/Tell_City|America/Indiana/Vevay|America/Indiana/Vincennes|America/Indiana/Winamac|America/Inuvik|America/Iqaluit|America/Jamaica|America/Juneau|America/Kentucky/Louisville|America/Kentucky/Monticello|America/La_Paz|America/Lima|America/Los_Angeles|America/Maceio|America/Managua|America/Manaus|America/Martinique|America/Matamoros|America/Mazatlan|America/Menominee|America/Merida|America/Metlakatla|America/Mexico_City|America/Miquelon|America/Moncton|America/Monterrey|America/Montevideo|America/New_York|America/Nome|America/Noronha|America/North_Dakota/Beulah|America/North_Dakota/Center|America/North_Dakota/New_Salem|America/Nuuk|America/Ojinaga|America/Panama|America/Paramaribo|America/Phoenix|America/Port-au-Prince|America/Porto_Velho|America/Puerto_Rico|America/Punta_Arenas|America/Rankin_Inlet|America/Recife|America/Regina|America/Resolute|America/Rio_Branco|America/Santarem|America/Santiago|America/Santo_Domingo|America/Sao_Paulo|America/Scoresbysund|America/Sitka|America/St_Johns|America/Swift_Current|America/Tegucigalpa|America/Thule|America/Tijuana|America/Toronto|America/Vancouver|America/Whitehorse|America/Winnipeg|America/Yakutat|Antarctica/Casey|Antarctica/Davis|Antarctica/Macquarie|Antarctica/Mawson|Antarctica/Palmer|Antarctica/Rothera|Antarctica/Troll|Antarctica/Vostok|Asia/Almaty|Asia/Amman|Asia/Anadyr|Asia/Aqtau|Asia/Aqtobe|Asia/Ashgabat|Asia/Atyrau|Asia/Baghdad|Asia/Baku|Asia/Bangkok|Asia/Barnaul|Asia/Beirut|Asia/Bishkek|Asia/Chita|Asia/Colombo|Asia/Damascus|Asia/Dhaka|Asia/Dili|Asia/Dubai|Asia/Dushanbe|Asia/Famagusta|Asia/Gaza|Asia/Hebron|Asia/Ho_Chi_Minh|Asia/Hong_Kong|Asia/Hovd|Asia/Irkutsk|Asia/Jakarta|Asia/Jayapura|Asia/Jerusalem|Asia/Kabul|Asia/Kamchatka|Asia/Karachi|Asia/Kathmandu|Asia/Khandyga|Asia/Kolkata|Asia/Krasnoyarsk|Asia/Kuching|Asia/Macau|Asia/Magadan|Asia/Makassar|Asia/Manila|Asia/Nicosia|Asia/Novokuznetsk|Asia/Novosibirsk|Asia/Omsk|Asia/Oral|Asia/Pontianak|Asia/Pyongyang|Asia/Qatar|Asia/Qostanay|Asia/Qyzylorda|Asia/Riyadh|Asia/Sakhalin|Asia/Samarkand|Asia/Seoul|Asia/Shanghai|Asia/Singapore|Asia/Srednekolymsk|Asia/Taipei|Asia/Tashkent|Asia/Tbilisi|Asia/Tehran|Asia/Thimphu|Asia/Tokyo|Asia/Tomsk|Asia/Ulaanbaatar|Asia/Urumqi|Asia/Ust-Nera|Asia/Vladivostok|Asia/Yakutsk|Asia/Yangon|Asia/Yekaterinburg|Asia/Yerevan|Atlantic/Azores|Atlantic/Bermuda|Atlantic/Canary|Atlantic/Cape_Verde|Atlantic/Faroe|Atlantic/Madeira|Atlantic/South_Georgia|Atlantic/Stanley|Australia/Adelaide|Australia/Brisbane|Australia/Broken_Hill|Australia/Darwin|Australia/Eucla|Australia/Hobart|Australia/Lindeman|Australia/Lord_Howe|Australia/Melbourne|Australia/Perth|Australia/Sydney|Etc/GMT|Etc/GMT+1|Etc/GMT+10|Etc/GMT+11|Etc/GMT+12|Etc/GMT+2|Etc/GMT+3|Etc/GMT+4|Etc/GMT+5|Etc/GMT+6|Etc/GMT+7|Etc/GMT+8|Etc/GMT+9|Etc/GMT-1|Etc/GMT-10|Etc/GMT-11|Etc/GMT-12|Etc/GMT-13|Etc/GMT-14|Etc/GMT-2|Etc/GMT-3|Etc/GMT-4|Etc/GMT-5|Etc/GMT-6|Etc/GMT-7|Etc/GMT-8|Etc/GMT-9|Etc/UTC|Europe/Andorra|Europe/Astrakhan|Europe/Athens|Europe/Belgrade|Europe/Berlin|Europe/Brussels|Europe/Bucharest|Europe/Budapest|Europe/Chisinau|Europe/Dublin|Europe/Gibraltar|Europe/Helsinki|Europe/Istanbul|Europe/Kaliningrad|Europe/Kirov|Europe/Kyiv|Europe/Lisbon|Europe/London|Europe/Madrid|Europe/Malta|Europe/Minsk|Europe/Moscow|Europe/Paris|Europe/Prague|Europe/Riga|Europe/Rome|Europe/Samara|Europe/Saratov|Europe/Simferopol|Europe/Sofia|Europe/Tallinn|Europe/Tirane|Europe/Ulyanovsk|Europe/Vienna|Europe/Vilnius|Europe/Volgograd|Europe/Warsaw|Europe/Zurich|Factory|Indian/Chagos|Indian/Maldives|Indian/Mauritius|Pacific/Apia|Pacific/Auckland|Pacific/Bougainville|Pacific/Chatham|Pacific/Easter|Pacific/Efate|Pacific/Fakaofo|Pacific/Fiji|Pacific/Galapagos|Pacific/Gambier|Pacific/Guadalcanal|Pacific/Guam|Pacific/Honolulu|Pacific/Kanton|Pacific/Kiritimati|Pacific/Kosrae|Pacific/Kwajalein|Pacific/Marquesas|Pacific/Nauru|Pacific/Niue|Pacific/Norfolk|Pacific/Noumea|Pacific/Pago_Pago|Pacific/Palau|Pacific/Pitcairn|Pacific/Port_Moresby|Pacific/Rarotonga|Pacific/Tahiti|Pacific/Tarawa|Pacific/Tongatapu';
  const LINKS =
    'Iceland:0|Africa/Accra:0|Africa/Bamako:0|Africa/Banjul:0|Africa/Conakry:0|Africa/Dakar:0|Africa/Freetown:0|Africa/Lome:0|Africa/Nouakchott:0|Africa/Ouagadougou:0|Atlantic/Reykjavik:0|Atlantic/St_Helena:0|Africa/Timbuktu:0|Egypt:3|Africa/Maseru:7|Africa/Mbabane:7|Africa/Bangui:10|Africa/Brazzaville:10|Africa/Douala:10|Africa/Kinshasa:10|Africa/Libreville:10|Africa/Luanda:10|Africa/Malabo:10|Africa/Niamey:10|Africa/Porto-Novo:10|Africa/Blantyre:11|Africa/Bujumbura:11|Africa/Gaborone:11|Africa/Harare:11|Africa/Kigali:11|Africa/Lubumbashi:11|Africa/Lusaka:11|Africa/Addis_Ababa:13|Africa/Asmara:13|Africa/Dar_es_Salaam:13|Africa/Djibouti:13|Africa/Kampala:13|Africa/Mogadishu:13|Indian/Antananarivo:13|Indian/Comoro:13|Indian/Mayotte:13|Africa/Asmera:13|Libya:16|US/Aleutian:19|America/Atka:19|US/Alaska:20|America/Buenos_Aires:22|America/Catamarca:23|America/Argentina/ComodRivadavia:23|America/Cordoba:24|America/Rosario:24|America/Jujuy:25|America/Mendoza:27|CST6CDT:48|US/Central:48|MST7MDT:57|Navajo:57|US/Mountain:57|America/Shiprock:57|US/Michigan:58|Canada/Mountain:59|America/Yellowknife:59|Canada/Atlantic:70|Cuba:71|US/East-Indiana:73|America/Indianapolis:73|America/Fort_Wayne:73|US/Indiana-Starke:74|America/Knox_IN:74|America/Pangnirtung:82|Jamaica:83|America/Louisville:85|US/Pacific:89|PST8PDT:89|Brazil/West:92|Mexico/BajaSur:95|Mexico/General:99|EST5EDT:104|US/Eastern:104|Brazil/DeNoronha:106|America/Godthab:110|EST:112|America/Atikokan:112|America/Cayman:112|America/Coral_Harbour:112|MST:114|US/Arizona:114|America/Creston:114|America/Virgin:117|America/Anguilla:117|America/Antigua:117|America/Aruba:117|America/Blanc-Sablon:117|America/Curacao:117|America/Dominica:117|America/Grenada:117|America/Guadeloupe:117|America/Kralendijk:117|America/Lower_Princes:117|America/Marigot:117|America/Montserrat:117|America/Port_of_Spain:117|America/St_Barthelemy:117|America/St_Kitts:117|America/St_Lucia:117|America/St_Thomas:117|America/St_Vincent:117|America/Tortola:117|Canada/Saskatchewan:121|Brazil/Acre:123|America/Porto_Acre:123|Chile/Continental:125|Brazil/East:127|Canada/Newfoundland:130|Mexico/BajaNorte:134|America/Ensenada:134|America/Santa_Isabel:134|Canada/Eastern:135|America/Nassau:135|America/Montreal:135|America/Nipigon:135|America/Thunder_Bay:135|Canada/Pacific:136|Canada/Yukon:137|Canada/Central:138|America/Rainy_River:138|Asia/Ashkhabad:153|Asia/Phnom_Penh:157|Asia/Vientiane:157|Indian/Christmas:157|Asia/Dacca:164|Asia/Muscat:166|Indian/Mahe:166|Indian/Reunion:166|Asia/Saigon:171|Hongkong:172|Israel:177|Asia/Tel_Aviv:177|Asia/Katmandu:181|Asia/Calcutta:183|Asia/Brunei:185|Asia/Macao:186|Asia/Ujung_Pandang:188|Europe/Nicosia:190|Asia/Bahrain:197|Antarctica/Syowa:200|Asia/Aden:200|Asia/Kuwait:200|ROK:203|PRC:204|Asia/Chongqing:204|Asia/Harbin:204|Asia/Chungking:204|Singapore:205|Asia/Kuala_Lumpur:205|ROC:207|Iran:210|Asia/Thimbu:211|Japan:212|Asia/Choibalsan:214|Asia/Ulan_Bator:214|Asia/Kashgar:215|Indian/Cocos:219|Asia/Rangoon:219|Atlantic/Faeroe:226|Australia/South:230|Australia/Queensland:231|Australia/Yancowinna:232|Australia/North:233|Australia/Tasmania:235|Australia/Currie:235|Australia/LHI:237|Australia/Victoria:238|Australia/West:239|Australia/ACT:240|Australia/NSW:240|Australia/Canberra:240|GMT:241|Etc/GMT+0:241|Etc/GMT-0:241|Etc/GMT0:241|Etc/Greenwich:241|GMT+0:241|GMT-0:241|GMT0:241|Greenwich:241|Etc/UCT:268|Etc/Universal:268|Etc/Zulu:268|UCT:268|UTC:268|Universal:268|Zulu:268|EET:271|Europe/Ljubljana:272|Europe/Podgorica:272|Europe/Sarajevo:272|Europe/Skopje:272|Europe/Zagreb:272|Arctic/Longyearbyen:273|Europe/Copenhagen:273|Europe/Oslo:273|Europe/Stockholm:273|Atlantic/Jan_Mayen:273|CET:274|MET:274|Europe/Amsterdam:274|Europe/Luxembourg:274|Europe/Tiraspol:277|Eire:278|Europe/Mariehamn:280|Turkey:281|Asia/Istanbul:281|Europe/Uzhgorod:284|Europe/Zaporozhye:284|Europe/Kiev:284|Portugal:285|WET:285|GB:286|GB-Eire:286|Europe/Guernsey:286|Europe/Isle_of_Man:286|Europe/Jersey:286|Europe/Belfast:286|W-SU:290|Europe/Monaco:291|Europe/Bratislava:292|Europe/San_Marino:294|Europe/Vatican:294|Poland:305|Europe/Busingen:306|Europe/Vaduz:306|Indian/Kerguelen:309|NZ:312|Antarctica/McMurdo:312|Antarctica/South_Pole:312|NZ-CHAT:314|Chile/EasterIsland:315|Pacific/Pohnpei:321|Pacific/Ponape:321|Pacific/Saipan:322|US/Hawaii:323|Pacific/Johnston:323|HST:323|Pacific/Enderbury:324|Kwajalein:327|US/Samoa:333|Pacific/Samoa:333|Pacific/Midway:333|Antarctica/DumontDUrville:336|Pacific/Chuuk:336|Pacific/Yap:336|Pacific/Truk:336|Pacific/Funafuti:339|Pacific/Majuro:339|Pacific/Wake:339|Pacific/Wallis:339';

  const links = LINKS.split('|').map((r) => r.split(':')[0]);
  const zones = ZONES.split('|');
  const origkeys = [...zones, ...links];

  const trie = newTrie();
  for (let i = 0; i < origkeys.length; i++) {
    addKey(trie, origkeys[i], i);
  }

  const nodes: number[] = [];
  encodeTrie(trie, nodes);

  //   const cases: number[][] = [nodes, repeat(0, r), repeat(1, r), repeat(65535, r), random(gen, r, 65535), nodes];
  const cases: number[][] = [[...nodes, ...nodes, ...nodes, ...nodes]];
  for (let i = 0; i < cases.length; i++) {
    const nums = cases[i];
    // let j = nums.length;
    // for (let j = 1; j < nums.length; j += 100) {
    for (let j = 0; j < 10; j++) {
      //   const input = nums.slice(0, j);
      const input = nums;
      const u16 = new Uint16Array(input);
      let start = process.hrtime();
      const enc = encodeX85(encodeGVE16(u16));
      // if (j === 0) {
      //   console.log(JSON.stringify(enc));
      // }
      let end = process.hrtime(start);

      const gz = deflateSync(enc, { level: 9 });
      const ratio = enc.length / u16.byteLength;

      console.log(`\n${j + 1} encode ${elapsed(end)}ms ratio ${Math.round(ratio * 100)}%`);
      console.log(`${j + 1} gz ${gz.length} enc ${enc.length} u16 bytes ${u16.byteLength}`);

      start = process.hrtime();
      const dec = decodeX85GVE16(enc);
      end = process.hrtime(start);
      console.log(`${j + 1} decode ${elapsed(end)}ms`);

      expect(dec, `case ${j + 1} ${JSON.stringify(input)}`).toEqual(u16);
    }
  }
});
