export const DATA_VERSION = '2026-full-schedule-v2';

export const DATA_SOURCE = {
  label: 'FIFA match schedule, crawlable mirror via MatchTimes',
  officialUrl:
    'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums',
  crawlableUrl: 'https://matchtimes.app/schedule',
  lastSyncedAt: '2026-06-04T00:00:00Z',
};

export const FIFA_RANKING_SOURCE = {
  label: "FIFA/Coca-Cola Men's World Ranking",
  officialUrl: 'https://inside.fifa.com/fifa-world-ranking/men',
  lastOfficialUpdate: '2026-04-01',
  nextOfficialUpdate: '2026-06-11',
  lastSyncedAt: '2026-06-04T00:00:00Z',
};

export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const GROUPS = {
  A: ['Mexico', 'South Africa', 'Korea Republic', 'Czechia'],
  B: ['Canada', 'Switzerland', 'Qatar', 'Bosnia and Herzegovina'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['United States', 'Paraguay', 'Australia', 'Turkey'],
  E: ['Germany', 'Curacao', "Cote d'Ivoire", 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Tunisia', 'Sweden'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cabo Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'Congo DR', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

export const TEAM_META = {
  Unknown: {
    flag: '?',
    fifaCode: 'UNK',
    fifaRank: null,
    viName: 'Unknown',
    flagUrl: '',
  },
  Mexico: team('🇲🇽', 'MEX', 15, 'Mexico'),
  'South Africa': team('🇿🇦', 'RSA', 60, 'Nam Phi'),
  'Korea Republic': team('🇰🇷', 'KOR', 25, 'Hàn Quốc'),
  Czechia: team('🇨🇿', 'CZE', 41, 'Séc'),
  Canada: team('🇨🇦', 'CAN', 30, 'Canada'),
  Switzerland: team('🇨🇭', 'SUI', 19, 'Thụy Sĩ'),
  Qatar: team('🇶🇦', 'QAT', 55, 'Qatar'),
  'Bosnia and Herzegovina': team('🇧🇦', 'BIH', 65, 'Bosna và Hercegovina'),
  Brazil: team('🇧🇷', 'BRA', 6, 'Brasil'),
  Morocco: team('🇲🇦', 'MAR', 8, 'Maroc'),
  Haiti: team('🇭🇹', 'HAI', 83, 'Haiti'),
  Scotland: team('🏴', 'SCO', 43, 'Scotland'),
  'United States': team('🇺🇸', 'USA', 16, 'Hoa Kỳ'),
  Paraguay: team('🇵🇾', 'PAR', 40, 'Paraguay'),
  Australia: team('🇦🇺', 'AUS', 27, 'Úc'),
  Turkey: team('🇹🇷', 'TUR', 22, 'Thổ Nhĩ Kỳ'),
  Germany: team('🇩🇪', 'GER', 10, 'Đức'),
  Curacao: team('🇨🇼', 'CUW', 82, 'Curaçao'),
  "Cote d'Ivoire": team('🇨🇮', 'CIV', 34, 'Bờ Biển Ngà'),
  Ecuador: team('🇪🇨', 'ECU', 23, 'Ecuador'),
  Netherlands: team('🇳🇱', 'NED', 7, 'Hà Lan'),
  Japan: team('🇯🇵', 'JPN', 18, 'Nhật Bản'),
  Tunisia: team('🇹🇳', 'TUN', 44, 'Tunisia'),
  Sweden: team('🇸🇪', 'SWE', 38, 'Thụy Điển'),
  Belgium: team('🇧🇪', 'BEL', 9, 'Bỉ'),
  Egypt: team('🇪🇬', 'EGY', 29, 'Ai Cập'),
  Iran: team('🇮🇷', 'IRN', 21, 'Iran'),
  'New Zealand': team('🇳🇿', 'NZL', 85, 'New Zealand'),
  Spain: team('🇪🇸', 'ESP', 2, 'Tây Ban Nha'),
  'Cabo Verde': team('🇨🇻', 'CPV', 69, 'Cabo Verde'),
  'Saudi Arabia': team('🇸🇦', 'KSA', 61, 'Ả Rập Xê Út'),
  Uruguay: team('🇺🇾', 'URU', 17, 'Uruguay'),
  France: team('🇫🇷', 'FRA', 1, 'Pháp'),
  Senegal: team('🇸🇳', 'SEN', 14, 'Senegal'),
  Iraq: team('🇮🇶', 'IRQ', 57, 'Iraq'),
  Norway: team('🇳🇴', 'NOR', 31, 'Na Uy'),
  Argentina: team('🇦🇷', 'ARG', 3, 'Argentina'),
  Algeria: team('🇩🇿', 'ALG', 28, 'Algérie'),
  Austria: team('🇦🇹', 'AUT', 24, 'Áo'),
  Jordan: team('🇯🇴', 'JOR', 63, 'Jordan'),
  Portugal: team('🇵🇹', 'POR', 5, 'Bồ Đào Nha'),
  'Congo DR': team('🇨🇩', 'COD', 46, 'CHDC Congo'),
  Uzbekistan: team('🇺🇿', 'UZB', 50, 'Uzbekistan'),
  Colombia: team('🇨🇴', 'COL', 13, 'Colombia'),
  England: team('🏴', 'ENG', 4, 'Anh'),
  Croatia: team('🇭🇷', 'CRO', 11, 'Croatia'),
  Ghana: team('🇬🇭', 'GHA', 74, 'Ghana'),
  Panama: team('🇵🇦', 'PAN', 33, 'Panama'),
};

export const TEAM_OPTIONS = Object.values(GROUPS)
  .flat()
  .sort(compareTeamsByFifaRank);

export const SQUAD_PLAYERS = {
  Algeria: `Luca Zidane, Oussama Benbot, Melvin Mastil, Aissa Mandi, Ramy Bensebaini, Mohamed Amine Tougai, Rayan Ait-Nouri, Jaouen Hadjam, Rafik Belghali, Zineddine Belaid, Achref Abada, Samir Chergui, Nabil Bentaleb, Ramiz Zerrouki, Hicham Boudaoui, Fares Chaibi, Houssem Aouar, Ibrahim Maza, Yacine Titraoui, Riyad Mahrez, Mohamed Amoura, Amine Gouiri, Anis Hadj Moussa, Adil Boulbina, Nadhir Benbouali, Fares Ghedjemis`,
  Argentina: `Emiliano Martinez, Geronimo Rulli, Juan Musso, Gonzalo Montiel, Nahuel Molina, Lisandro Martinez, Nicolas Otamendi, Leonardo Balerdi, Cristian Romero, Nicolas Tagliafico, Facundo Medina, Giovani Lo Celso, Leandro Paredes, Rodrigo De Paul, Exequiel Palacios, Enzo Fernandez, Alexis Mac Allister, Valentin Barco, Lionel Messi, Nicolas Gonzalez, Giuliano Simeone, Lautaro Martinez, Jose Manuel Lopez, Julian Alvarez, Thiago Almada, Nico Paz`,
  Australia: `Mathew Ryan, Paul Izzo, Patrick Beach, Jordan Bos, Aziz Behich, Harry Souttar, Alessandro Circati, Lucas Herrington, Cameron Burgess, Kai Trewin, Milos Degenek, Jason Geria, Jacob Italiano, Jackson Irvine, Aiden O'Neill, Paul Okon Jr, Cameron Devlin, Connor Metcalfe, Mathew Leckie, Nishan Velupillay, Cristian Volpato, Nestory Irankunda, Awer Mabil, Ajdin Hrustic, Mohamed Toure, Tete Yengi`,
  Austria: `Schlager, Pentz, Wiegele, Laimer, Danso, Friedl, Lienhart, Affengruber, Prass, Posch, Alaba, Svoboda, Mwene, Baumgartner, Seiwald, Chukwuemeka, Wanner, Schmid, Wimmer, Sabitzer, Grillitsch, Gregoritsch, Schopf, Arnautovic, Kalajdzic`,
  Belgium: `Lammens, Penders, Courtois, Debast, De Winter, De Cuyper, Theate, N'Goy, Seys, Castagne, Mechele, Meunier, Onana, Tielemans, Fernandez-Pardo, Saelemaekers, Moreira, Raskin, De Bruyne, Vanaken, Witsel, Doku, De Ketelaere, Lukebakio, Trossard, Lukaku`,
  'Bosnia and Herzegovina': `Vasilj, Zlomislic, Hadzikic, Muharemovic, Dedic, Kolasinac, Celik, Radeljic, Katic, Hadzikadunic, Mujakic, Alajbegovic, Bajraktarevic, Memic, Tahirovic, Hadziahmetovic, Tabakovic, Gigovic, Mahmic, Sunjic, Lukic, Burnic, Basic, Demirovic, Dzeko, Bazdar`,
  Brazil: `Alisson, Ederson, Weverton, Bremer, Gabriel Ibanez, Alex Sandro, Douglas Santos, Marquinhos, Danilo, Leo Pereira, Casemiro, Fabinho, Bruno Guimaraes, Danilo Santos, Lucas Paqueta, Neymar Jr, Vinicius Junior, Raphinha, Matheus Cunha, Endrick, Igor Thiago, Gabriel Martinelli, Luiz Henrique, Rayan`,
  Canada: `Maxime Crepeau, Owen Goodman, Dayne St. Clair, Moise Bombito, Derek Cornelius, Alphonso Davies, Luc de Fougerolles, Alistair Johnston, Alfie Jones, Richie Laryea, Niko Sigur, Joel Waterman, Ali Ahmed, Tajon Buchanan, Mathieu Choiniere, Stephen Eustaquio, Marcelo Flores, Ismael Kone, Liam Millar, Jonathan Osorio, Nathan-Dylan Saliba, Jacob Saffelburg, Jonathan David, Promise David, Cyle Larin, Tani Oluwaseyi`,
  'Cabo Verde': `Santos, Rosa, Vozinha, Costa, Pina, Cabral, Moreira, Borges, Pires, Lopes, Stopira, Lenini, Arcanjo, Duarte, Varela, Semedo, Benchimol, Livramento, Monteiro, Joao Paulo, Da Costa, Rodrigues, Mendes`,
  Colombia: `Camilo Vargas, Alvaro Montero, David Ospina, Davinson Sanchez, Jhon Lucumi, Yerry Mina, Willer Ditta, Daniel Munoz, Santiago Arias, Johan Mojica, Deiver Machado, Richard Rios, Jefferson Lerma, Kevin Castano, Juan Camilo Portilla, Gustavo Puerta, Jhon Arias, Jorge Carrascal, Juan Fernando Quintero, James Rodriguez, Jaminton Campaz, Juan Camilo Hernandez, Luis Diaz, Luis Suarez, Carlos Andres Gomez, Jhon Cordoba`,
  'Congo DR': `Epolo, Fayulu, Mpasi-Nzau, Wan-Bissaka, Tuanzebe, Masuaku, Kayembe, Mbemba, Kapuadi, Kalulu, Bushiri, Batubinsika, Sadiki, Mukau, Bongonda, Pickel, Elia, Cipenga, Wissa, Banza, Mbuku, Mayele, Bakambu, Moutoussamy, Kakuta`,
  Croatia: `Kotarski, Livakovic, Pandur, Gvardiol, Vuskovic, Stanisic, Sutalo, Pongracic, Erlic, Caleta-Car, Sucic, Baturina, Kovacic, Matanovic, Fruk, Vlasic, Musa, Pasalic, Moro, Jakic, Modric, Kramaric, Budimir, Perisic`,
  Curacao: `Room, Doornbusch, Bodak, Obispo, Bazoer, Sambo, Brenet, Fonville, Floranus, Gaari, Van Eijma, Chong, Hansen, Bacuna, Margaritha, Antonisse, Noslin, Comenencia, Martha, Gorre, Roemeratoe, Felida, Kuwas, Locadia, Kastaneer`,
  Czechia: `Lukas Hornicek, Matej Kovar, Jindrich Stanek, Vladimir Coufal, David Doudera, Tomas Holes, Robin Hranac, Stepan Chaloupek, David Jurasek, Ladislav Krejci, Jaroslav Zeleny, David Zima, Lukas Cerv, Vladimir Darida, Lukas Provod, Michal Sadilek, Hugo Sochurek, Alexandr Sojka, Tomas Soucek, Pavel Sulc, Denis Visinsky, Tomas Chory, Adam Hlozek, Mojmir Chytil, Jan Kuchta, Patrik Schick`,
  Ecuador: `Hernan Galindez, Moises Ramirez, Gonzalo Valle, Willian Pacho, Piero Hincapie, Joel Ordonez, Felix Torres, Pervis Estupinan, Yaimar Medina, Angelo Preciado, Jackson Porozo, Alan Minda, Moises Caicedo, Jordy Alcivar, Denil Castillo, John Yeboah, Alan Franco, Pedro Vite, Kendry Paez, Nilson Angulo, Gonzalo Plata, Kevin Rodriguez, Anthony Valencia, Enner Valencia, Jordy Caicedo, Jeremy Arevalo`,
  Egypt: `Mohamed El Shennawy, Mostafa Shobeir, El Mahdy Soliman, Mohamed Alaa, Mohamed Hany, Tarek Alaa, Hamdi Fathi, Ramy Rabia, Yasser Ibrahim, Hossam Abdelmaguid, Mohamed Abdelmonem, Ahmed Fattouh, Karim Hafez, Marwan Attia, Mohannad Lasheen, Nabil Emad Dunga, Mahmoud Saber, Ahmed Sayed Zizo, Mahmoud Trezeguet, Emam Ashour, Mostafa Ziko, Ibrahim Adel, Haitham Hassan, Mohamed Salah, Omar Marmoush, Aktay Abdullah, Hamza Abdel Karim`,
  England: `Henderson, Trafford, Pickford, Guehi, James, O'Reilly, Quansah, Livramento, Konsa, Spence, Stones, Burn, Bellingham, Saka, Rice, Rogers, Anderson, Gordon, Eze, Mainoo, Madueke, Kane, Rashford, Watkins, Toney`,
  France: `Maignan, Risser, Samba, Saliba, Upamecano, Kounde, Konate, Lacroix, Gusto, Hernandez, Digne, Tchouameni, Zaire-Emery, Akliouche, Kone, Rabiot, Kante, Mbappe, Olise, Dembele, Doue, Barcola, Cherki, Thuram, Mateta`,
  Germany: `Nubel, Neuer, Baumann, Schlotterbeck, Thiaw, Kimmich, Brown, Tah, Raum, Anton, Rudiger, Musiala, Wirtz, Pavlovic, Woltemade, Karl, Nmecha, Stiller, Leweling, Beier, Goretzka, Gross, Havertz, Sane, Undav, Amiri`,
  Ghana: `Benjamin Asare, Lawrence Ati-Zigi, Joseph Anang, Solomon Agbasi, Paul Reverson, Baba Abdul Rahman, Gideon Mensah, Marvin Senaya, Alidu Seidu, Abdul Mumin, Jerome Opoku, Jonas Adjetey, Kojo Oppong Peprah, Alexander Djiku, Elisha Owusu, Thomas Partey, Kwasi Sibo, Augustine Boakye, Caleb Yirenkyi, Abdul Fatawu Issahaku, Kamal Deen Sulemana, Christopher Bonsu Baah, Ernest Nuamah, Antoine Semenyo, Brandon Thomas-Asante, Prince Kwabena Adu, Inaki Williams, Jordan Ayew`,
  Haiti: `Pierre, Placide, Duverger, Delcroix, Duverne, Arcus, Paugain, Experience, Ade, Lacroix, Thermoncy, Bellergarde, Casimir, Jean Jacques, Pierrot, Deedson, Joseph, Nazon, Etienne Jr, Isidor, Providence, Simon, Fortune, Sainte`,
  Iran: `Alireza Beiranvand, Hossein Hosseini, Payam Niazmand, Mohammed Khalifeh, Danial Eiri, Ehsan Hajsafi, Saleh Hardani, Hossein Kanaani, Shoka Khalilzadeh, Milad Mohammadi, Ali Nemati, Omid Noorafkan, Ramin Rezaeian, Rouzbeh Cheshmi, Saeid Ezatolahi, Mehdi Ghaedi, Saman Ghoddos, Mohammad Ghorbani, Alireza Jahanbakhsh, Mohammad Mohebi, Amir Mohammad Razzaghinia, Mehdi Torabi, Aria Yousefi, Ali Alipour, Dennis Dargahi, Hadi Habibinejad, Amirhossein Hosseinzadeh, Amirhossein Mahmoudi, Kasra Taheri, Mehdi Taremi`,
  Iraq: `Fahad Talib, Jalal Hassan, Ahmed Basil, Hussein Ali, Manaf Younis, Zaid Tahseen, Rebin Sulaka, Akam Hashem, Merchas Doski, Ahmed Yahya, Zaid Ismail, Frans Putros, Mustafa Saadoon, Amir Al-Ammari, Kevin Yakob, Zidane Iqbal, Aimar Sher, Ibrahim Bayesh, Ahmed Qasim, Youssef Amyn, Marko Farji, Ali Jasim, Ali Al-Hamadi, Ali Yousef, Aymen Hussein, Mohanad Ali`,
  Japan: `Tomoki Hayakawa, Keisuke Osako, Aya Suzuka, Yuto Nagatomo, Shogo Taniguchi, Ko Itakura, Tsuyoshi Watanabe, Takehiro Tomiyasu, Hiroki Ito, Ayumu Seko, Yukinari Sugawara, Junosuke Suzuki, Wataru Endo, Junya Ito, Daichi Kamada, Koki Ogawa, Daizen Maeda, Ritsu Doan, Ao Tanaka, Kaishu Sano, Takefusa Kubo, Ayase Ueda, Keito Nakamura, Ito Suzuki, Kento Shiode, Keisuke Goto`,
  Jordan: `Yazid Abulaila, Abdallah Al-Fakhouri, Ahmad Al-Juiadi, Nour Bani Attiah, Mohammad Abualnadi, Yousef Abu Al-Jazar, Husam Abu Dahab, Mohammed Abu Hashish, Mohannad Abu Taha, Yazan Al-Arab, Saed Al-Rosna, Ahmad Assaf, Anas Badawi, Abdallah Nasib, Ehsan Haddad, Saleem Obaid, Mohammad Abu Taha, Mohammed Al-Dawoud, Nizar Al-Rashdan, Noor Al-Rawabdeh, Rajaei Ayed, Amer Jamous, Yousef Qashi, Ibrahim Sadeh, Mohammed Abu Zraiq, Mousa Al-Tamari, Ali Azaizeh, Odeh Al-Fakhouri, Ali Olwan, Ibrahim Sabra`,
  'Korea Republic': `Bum-Keun Song, Hyeon-Woo Jo, Seung-Gyu Kim, Min-Jae Kim, J. Castrop, Young-Woo Seol, Yu-Min Cho, Han-Beom Lee, Tae-Seok Lee, Jin-Seob Park, Moon-Hwan Kim, Tae-Hyeong Kim, Gi-Hyuk Lee, Kang-In Lee, Heung-Min Son, Hyeon-Gyu Oh, Hee-Chan Hwang, In-Beom Hwang, Gue-Sung Cho, Hyun-Jun Yang, Jun-Ho Bae, Seung-Ho Paik, Jae-Sung Lee, Dong-Gyeong Lee, Ji-Sung Eom, Jin-Gyu Kim`,
  Mexico: `Carlos Acevedo, Guillermo Ochoa, Raul Rangel, Jesus Gallardo, Israel Reyes, Cesar Montes, Jorge Sanchez, Johan Vasquez, Mateo Chavez, Gilberto Mora, Edson Alvarez, Orbelin Pineda, Luis Romo, Brian Gutierrez, Obed Vargas, Cesar Huerta, Luis Chavez, Erik Lira, Alvaro Fidalgo, Roberto Alvarado, Armando Gonzalez, Raul Jimenez, Julian Quinones, Santiago Gimenez, Guillermo Martinez, Alexis Vega`,
  Morocco: `Yassine Bounou, Munir Kajoui, Ahmed Reda Tagnaouti, Achraf Hakimi, Noussair Mazraoui, Anass Salah-Eddine, Youssef Belammari, Issa Diop, Chadi Riad, Zakaria El Ouahdi, Reduana Halhal, Nayef Aguerd, Neil El Aynaoui, Azzedine Ounahi, Ismael Saibari, Bilal El Khannouss, Samir El Mourabet, Sofyan Amrabat, Ayyoub Bouaddi, Brahim Diaz, Ayoub El Kaabi, Abde Ezzalzouli, Soufiane Rahimi, Gessime Yassine, Ayoube Amaimouni, Chemsdine Talbi`,
  Netherlands: `Mark Flekken, Robin Roefs, Bart Verbruggen, Nathan Ake, Denzel Dumfries, Jorrel Hato, Jurrien Timber, Micky van de Ven, Virgil van Dijk, Jan Paul van Hecke, Mats Wieffer, Frenkie de Jong, Marten de Roon, Ryan Gravenberch, Justin Kluivert, Teun Koopmeiners, Tijjani Reijnders, Guus Til, Quinten Timber, Brian Brobbey, Memphis Depay, Cody Gakpo, Noa Lang, Donyell Malen, Crysencio Summerville, Wout Weghorst`,
  'New Zealand': `Max Crocombe, Alex Paulsen, Michael Woud, Tim Payne, Francis De Vries, Tyler Bindon, Michael Boxall, Liberato Cacace, Nando Pijnaker, Finn Surman, Callan Elliot, Tommy Smith, Joe Bell, Marko Stamenic, Alex Rufer, Ryan Thomas, Lachlan Bayliss, Matt Garbett, Chris Wood, Sarpreet Singh, Eli Just, Kosta Barbarouses, Ben Waine, Ben Old, Callum McCowatt, Jesse Randall`,
  Norway: `Tangvik, Selvik, Nyland, Ryerson, Ajer, Heggem, Ostigard, Wolfe, Falchener, Bjorkan, Pedersen, Langas, Odegaard, Nusa, Bobb, Berge, Schjelderup, Aursnes, Hauge, Thorstvedt, Berg, Thorsby, Aasgaard, Haaland, Strand Larsen, Sorloth`,
  Panama: `Orlando Mosquera, Luis Mejia, Cesar Samudio, Cesar Blackman, Jorge Gutierrez, Amir Murillo, Fidel Escobar, Andres Andrade, Edgardo Farina, Jose Cordoba, Eric Davis, Jiovani Ramos, Roderick Miller, Anibal Godoy, Adalberto Carrasquilla, Carlos Harvey, Cristian Martinez, Jose Luis Rodriguez, Cesar Yanis, Yoel Barcenas, Alberto Quintero, Azarias Londono, Ismael Diaz, Cecilio Waterman, Jose Fajardo, Tomas Rodriguez`,
  Paraguay: `Roberto Fernandez, Orlando Gill, Gaston Olveira, Gustavo Gomez, Junior Alonso, Fabian Balbuena, Omar Alderete, Juan Caceres, Jose Canale, Alexandro Maidana, Gustavo Velazquez, Alejandro Kaku Gamarra, Andres Cubas, Diego Gomez, Damian Bobadilla, Braian Ojeda, Matias Galarza, Mauricio Magalhaes, Miguel Almiron, Antonio Sanabria, Julio Enciso, Gabriel Avalos, Alex Arce, Gustavo Caballero, Ramon Sosa, Isidro Pitta`,
  Portugal: `Diogo Costa, Rui Silva, Jose Sa, Velho, Nuno Mendes, Ruben Dias, Tomas Araujo, Goncalo Inacio, Diogo Dalot, Antonio Silva, Renato Veiga, Joao Cancelo, Nelson Semedo, Joao Neves, Vitinha, Bruno Fernandes, Bernardo Silva, Ruben Neves, Francisco Conceicao, Pedro Neto, Francisco Trincao, Rafael Leao, Goncalo Ramos, Joao Felix, Cristiano Ronaldo, Goncalo Guedes`,
  Qatar: `Shehab Ellethy, Salah Zakaria, Meshaal Barsham, Mahmoud Abunada, Boualem Khoukhi, Pedro Miguel, Sultan Al-Brake, Tarek Salman, Al-Hashmi Al-Hussain, Ayoub Al-Oui, Bassam Al-Rawi, Rayyan Al-Ali, Issa Laye, Lucas Mendes, Mohammed Waad, Niall Mason, Ahmed Fathy, Jassim Gaber, Assim Madibo, Abdulaziz Hatem, Karim Boudiaf, Mohamed Al-Mannai, Homam Al-Amin, Almoez Ali, Akram Afif, Tahsin Mohammed, Edmilson Junior, Ahmed Al-Ganehi, Ahmed Alaa, Sebastian Soria, Hassan Al-Haydos, Mubarak Shanan, Mohammed Muntari, Yusuf Abdurisag`,
  'Saudi Arabia': `Mohammed Al Owais, Nawaf Al Aqidi, Ahmed Al Kassar, Abdulelah Al Amri, Hassan Tambakti, Jehad Thikri, Ali Lajami, Hassan Kadesh, Saud Abdulhamid, Mohammed Abu Al Shamat, Ali Majrashi, Moteb Al Harbi, Nawaf Boushal, Sultan Al Ghannam, Mohammed Kanno, Abdullah Al Khaibari, Ziyad Al Johani, Nasser Al Dawsari, Musab Al Juwayr, Alaa Al Hajji, Salem Al Dawsari, Khalid Al Ghannam, Ayman Yahya, Firas Al Buraikan, Saleh Al Shehri, Abdullah Al Hamdan`,
  Scotland: `Gunn, Kelly, Gordon, Hickey, Robertson, Patterson, Tierney, McKenna, Souttar, Hyam, Hendry, Ralston, Hanley, McTominay, Gilmour, Ferguson, Gannon-Doak, McGinn, Christie, Adams, Hirst, Shankland, Stewart, Dykes, Curtis, McLean`,
  Senegal: `Edouard Mendy, Mory Diaw, Yehvann Diouf, Krepin Diatta, Antoine Mendy, Kalidou Koulibaly, El Hadji Malick Diouf, Mamadou Sarr, Moussa Niakhate, Moustapha Mbow, Abdoulaye Seck, Ismail Jakobs, Ilay Camara, Idrissa Gana Gueye, Pape Gueye, Lamine Camara, Habib Diarra, Pathe Ciss, Pape Matar Sarr, Bara Sapoko Ndiaye, Sadio Mane, Ismaila Sarr, Iliman Ndiaye, Assane Diao, Ibrahim Mbaye, Nicolas Jackson, Bamba Dieng, Cherif Ndiaye`,
  'South Africa': `Ronwen Williams, Ricardo Goss, Sipho Chaine, Khuliso Mudau, Nkosinathi Sibisi, Ime Okon, Khulumani Ndamane, Aubrey Modiba, Samukelo Kabini, Thabang Matuludi, Olwethu Makhanya, Kamogelo Sebelebele, Bradley Cross, Mbekezeli Mbokazi, Teboho Mokoena, Thalente Mbatha, Yaya Sithole, Jayden Adams, Oswin Appollis, Iqraam Rayners, Tshepang Moremi, Relebohile Mofokeng, Evidence Makgopa, Themba Zwane, Lyle Foster, Thapelo Maseko`,
  Spain: `Unai Simon, David Raya, Joan Garcia, Pedro Porro, Marcos Llorente, Pau Cubarsi, Marc Pubill, Aymeric Laporte, Eric Garcia, Alejandro Grimaldo, Marc Cucurella, Rodri, Martin Zubimendi, Gavi, Dani Olmo, Pedri, Fabian Ruiz, Mikel Merino, Alex Baena, Lamine Yamal, Ferran Torres, Yeremy Pino, Nico Williams, Victor Munoz, Mikel Oyarzabal, Borja Iglesias`,
  Sweden: `Johansson, Zetterstrom, Nordfeldt, Svensson, Hien, Gudmundsson, Holm, Ekdal, Lindelof, Lagerbielke, Smith, Starfelt, Stroud, Bergvall, Elanga, Ayari, Nygren, Svanberg, Zeneli, Karlstrom, Bernhardsson, Nilsson, Ali, Sema, Isak, Gyokeres`,
  Switzerland: `Kobel, Keller, Mvogo, Akanji, Jaquez, Elvedi, Amenda, Muheim, Comert, Rodriguez, Widmer, Ndoye, Manzambi, Jashari, Zakaria, Okafor, Embolo, Vargas, Xhaka, Amdouni, Rieder, Sow, Aebischer, Freuler, Fassnacht, Itten`,
  Tunisia: `Dahmen, Chamakh, Ben Hassen, Talbi, Ali Abdi, Valery, Arous, Neffati, Bronn, Ben Hamida, Rekik, Chikhaoui, Hannibal, Tounekti, Skhiri, Gharbi, Achouri, Ben Slimane, Mahmoud, Saad, Khedira, Ben Ouanes, Chaouat, Ayari, Mastouri, Elloumi`,
  Turkey: `Altay Bayindir, Mert Gunok, Ugurcan Cakir, Abdulkerim Bardakci, Caglar Soyuncu, Eren Elmali, Ferdi Kadioglu, Merih Demiral, Mert Muldur, Ozan Kabak, Samet Akaydin, Zeki Celik, Hakan Calhanoglu, Ismail Yuksek, Kaan Ayhan, Orkun Kokcu, Salih Ozcan, Arda Guler, Baris Alper Yilmaz, Can Uzun, Deniz Gul, Irfan Can Kahveci, Kenan Yildiz, Kerem Akturkoglu, Oguz Aydin, Yunus Akgun`,
  'United States': `Chris Brady, Matt Freese, Matt Turner, Max Arfsten, Sergino Dest, Alex Freeman, Mark McKenzie, Tim Ream, Chris Richards, Antonee Robinson, Miles Robinson, Joe Scally, Auston Trusty, Tyler Adams, Sebastian Berhalter, Weston McKennie, Gio Reyna, Cristian Roldan, Malik Tillman, Brenden Aaronson, Folarin Balogun, Ricardo Pepi, Christian Pulisic, Tim Weah, Haji Wright, Alejandro Zendejas`,
  Uruguay: `Sergio Rochet, Fernando Muslera, Santiago Mele, Guillermo Varela, Ronald Araujo, Jose Maria Gimenez, Santiago Bueno, Sebastian Caceres, Mathias Olivera, Joaquin Piquerez, Matias Vina, Juan Manuel Sanabria, Manuel Ugarte, Emiliano Martinez, Rodrigo Bentancur, Federico Valverde, Agustin Canobbio, Giorgian de Arrascaeta, Nicolas de la Cruz, Facundo Pellistri, Rodrigo Zalazar, Maxi Araujo, Brian Rodriguez, Rodrigo Aguirre, Federico Vinas, Darwin Nunez`,
  Uzbekistan: `Utkir Yusupov, Abduvohid Nematov, Botirali Ergashev, Rustam Ashurmatov, Farrukh Sayfiev, Khojiakbar Alijonov, Sherzod Nasrullaev, Umar Eshmurodov, Abdukodir Khusanov, Abdulla Abdullaev, Bekhruz Karimov, Jakhongir Urozov, Avazbek Ulmasaliev, Otabek Shukurov, Jaloliddin Masharipov, Odiljon Hamrobekov, Oston Urunov, Jamshid Iskanderov, Dostonbek Khamdamov, Abbosbek Fayzullaev, Akmal Mozgovoy, Azizjon Ganiev, Sherzod Esanov, Eldor Shomurodov, Igor Sergeev, Azizbek Amonov`,
  "Cote d'Ivoire": `Yahia Fofana, Mohamed Kone, Alban Lafont, Emmanuel Agbadou, Clement Akpa, Ousmane Diomande, Guela Doue, Ghislain Konan, Odilon Kossonou, Evan Ndicka, Wilfried Singo, Seko Fofana, Parfait Guiagon, Franck Kessie, Christ Oulai, Ibrahim Sangare, Jean-Michael Seri, Simon Adingra, Ange-Yoan Bonny, Amad Diallo, Oumar Diakite, Yan Diomande, Evann Guessand, Nicolas Pepe, Bazoumana Toure, Elye Wahi`,
};

export const TOP_SCORER_OPTIONS = Object.entries(SQUAD_PLAYERS)
  .flatMap(([team, players]) => splitSquadPlayers(players).map((player) => scorer(player, team)))
  .sort(compareScorers);

export const MATCHES = [
  match(1, 'A', 'Mexico', 'South Africa', '2026-06-11T19:00:00Z'),
  match(2, 'A', 'Korea Republic', 'Czechia', '2026-06-12T02:00:00Z'),
  match(3, 'B', 'Canada', 'Bosnia and Herzegovina', '2026-06-12T19:00:00Z'),
  match(4, 'D', 'United States', 'Paraguay', '2026-06-13T01:00:00Z'),
  match(5, 'C', 'Haiti', 'Scotland', '2026-06-14T01:00:00Z'),
  match(6, 'D', 'Australia', 'Turkey', '2026-06-14T04:00:00Z'),
  match(7, 'C', 'Brazil', 'Morocco', '2026-06-13T22:00:00Z'),
  match(8, 'B', 'Qatar', 'Switzerland', '2026-06-13T19:00:00Z'),
  match(9, 'E', "Cote d'Ivoire", 'Ecuador', '2026-06-14T23:00:00Z'),
  match(10, 'E', 'Germany', 'Curacao', '2026-06-14T17:00:00Z'),
  match(11, 'F', 'Netherlands', 'Japan', '2026-06-14T20:00:00Z'),
  match(12, 'F', 'Sweden', 'Tunisia', '2026-06-15T02:00:00Z'),
  match(13, 'H', 'Saudi Arabia', 'Uruguay', '2026-06-15T22:00:00Z'),
  match(14, 'H', 'Spain', 'Cabo Verde', '2026-06-15T16:00:00Z'),
  match(15, 'G', 'Iran', 'New Zealand', '2026-06-16T01:00:00Z'),
  match(16, 'G', 'Belgium', 'Egypt', '2026-06-15T19:00:00Z'),
  match(17, 'I', 'France', 'Senegal', '2026-06-16T19:00:00Z'),
  match(18, 'I', 'Iraq', 'Norway', '2026-06-16T22:00:00Z'),
  match(19, 'J', 'Argentina', 'Algeria', '2026-06-17T01:00:00Z'),
  match(20, 'J', 'Austria', 'Jordan', '2026-06-17T04:00:00Z'),
  match(21, 'L', 'Ghana', 'Panama', '2026-06-17T23:00:00Z'),
  match(22, 'L', 'England', 'Croatia', '2026-06-17T20:00:00Z'),
  match(23, 'K', 'Portugal', 'Congo DR', '2026-06-17T17:00:00Z'),
  match(24, 'K', 'Uzbekistan', 'Colombia', '2026-06-18T02:00:00Z'),
  match(25, 'A', 'Czechia', 'South Africa', '2026-06-18T16:00:00Z'),
  match(26, 'B', 'Switzerland', 'Bosnia and Herzegovina', '2026-06-18T19:00:00Z'),
  match(27, 'B', 'Canada', 'Qatar', '2026-06-18T22:00:00Z'),
  match(28, 'A', 'Mexico', 'Korea Republic', '2026-06-19T01:00:00Z'),
  match(29, 'C', 'Brazil', 'Haiti', '2026-06-20T00:30:00Z'),
  match(30, 'C', 'Scotland', 'Morocco', '2026-06-19T22:00:00Z'),
  match(31, 'D', 'Turkey', 'Paraguay', '2026-06-20T03:00:00Z'),
  match(32, 'D', 'United States', 'Australia', '2026-06-19T19:00:00Z'),
  match(33, 'E', 'Germany', "Cote d'Ivoire", '2026-06-20T20:00:00Z'),
  match(34, 'E', 'Ecuador', 'Curacao', '2026-06-21T00:00:00Z'),
  match(35, 'F', 'Netherlands', 'Sweden', '2026-06-20T17:00:00Z'),
  match(36, 'F', 'Tunisia', 'Japan', '2026-06-21T04:00:00Z'),
  match(37, 'H', 'Uruguay', 'Cabo Verde', '2026-06-21T22:00:00Z'),
  match(38, 'H', 'Spain', 'Saudi Arabia', '2026-06-21T16:00:00Z'),
  match(39, 'G', 'Belgium', 'Iran', '2026-06-21T19:00:00Z'),
  match(40, 'G', 'New Zealand', 'Egypt', '2026-06-22T01:00:00Z'),
  match(41, 'I', 'Norway', 'Senegal', '2026-06-23T00:00:00Z'),
  match(42, 'I', 'France', 'Iraq', '2026-06-22T21:00:00Z'),
  match(43, 'J', 'Argentina', 'Austria', '2026-06-22T17:00:00Z'),
  match(44, 'J', 'Jordan', 'Algeria', '2026-06-23T03:00:00Z'),
  match(45, 'L', 'England', 'Ghana', '2026-06-23T20:00:00Z'),
  match(46, 'L', 'Panama', 'Croatia', '2026-06-23T23:00:00Z'),
  match(47, 'K', 'Portugal', 'Uzbekistan', '2026-06-23T17:00:00Z'),
  match(48, 'K', 'Colombia', 'Congo DR', '2026-06-24T02:00:00Z'),
  match(49, 'C', 'Scotland', 'Brazil', '2026-06-24T22:00:00Z'),
  match(50, 'C', 'Morocco', 'Haiti', '2026-06-24T22:00:00Z'),
  match(51, 'B', 'Switzerland', 'Canada', '2026-06-24T19:00:00Z'),
  match(52, 'B', 'Bosnia and Herzegovina', 'Qatar', '2026-06-24T19:00:00Z'),
  match(53, 'A', 'Czechia', 'Mexico', '2026-06-25T01:00:00Z'),
  match(54, 'A', 'South Africa', 'Korea Republic', '2026-06-25T01:00:00Z'),
  match(55, 'E', 'Curacao', "Cote d'Ivoire", '2026-06-25T20:00:00Z'),
  match(56, 'E', 'Ecuador', 'Germany', '2026-06-25T20:00:00Z'),
  match(57, 'F', 'Japan', 'Sweden', '2026-06-25T23:00:00Z'),
  match(58, 'F', 'Tunisia', 'Netherlands', '2026-06-25T23:00:00Z'),
  match(59, 'D', 'Turkey', 'United States', '2026-06-26T02:00:00Z'),
  match(60, 'D', 'Paraguay', 'Australia', '2026-06-26T02:00:00Z'),
  match(61, 'I', 'Norway', 'France', '2026-06-26T19:00:00Z'),
  match(62, 'I', 'Senegal', 'Iraq', '2026-06-26T19:00:00Z'),
  match(63, 'G', 'Egypt', 'Iran', '2026-06-27T03:00:00Z'),
  match(64, 'G', 'New Zealand', 'Belgium', '2026-06-27T03:00:00Z'),
  match(65, 'H', 'Cabo Verde', 'Saudi Arabia', '2026-06-27T00:00:00Z'),
  match(66, 'H', 'Uruguay', 'Spain', '2026-06-27T00:00:00Z'),
  match(67, 'L', 'Panama', 'England', '2026-06-27T21:00:00Z'),
  match(68, 'L', 'Croatia', 'Ghana', '2026-06-27T21:00:00Z'),
  match(69, 'J', 'Algeria', 'Austria', '2026-06-28T02:00:00Z'),
  match(70, 'J', 'Jordan', 'Argentina', '2026-06-28T02:00:00Z'),
  match(71, 'K', 'Colombia', 'Portugal', '2026-06-27T23:30:00Z'),
  match(72, 'K', 'Congo DR', 'Uzbekistan', '2026-06-27T23:30:00Z'),
  knockoutMatch(73, 'round32', 'V\u00f2ng 1/16', '2026-06-28T20:00:00Z'),
  knockoutMatch(74, 'round32', 'V\u00f2ng 1/16', '2026-06-29T17:00:00Z'),
  knockoutMatch(75, 'round32', 'V\u00f2ng 1/16', '2026-06-29T20:00:00Z'),
  knockoutMatch(76, 'round32', 'V\u00f2ng 1/16', '2026-06-29T23:00:00Z'),
  knockoutMatch(77, 'round32', 'V\u00f2ng 1/16', '2026-06-30T17:00:00Z'),
  knockoutMatch(78, 'round32', 'V\u00f2ng 1/16', '2026-06-30T20:00:00Z'),
  knockoutMatch(79, 'round32', 'V\u00f2ng 1/16', '2026-06-30T23:00:00Z'),
  knockoutMatch(80, 'round32', 'V\u00f2ng 1/16', '2026-07-01T17:00:00Z'),
  knockoutMatch(81, 'round32', 'V\u00f2ng 1/16', '2026-07-01T20:00:00Z'),
  knockoutMatch(82, 'round32', 'V\u00f2ng 1/16', '2026-07-01T23:00:00Z'),
  knockoutMatch(83, 'round32', 'V\u00f2ng 1/16', '2026-07-02T17:00:00Z'),
  knockoutMatch(84, 'round32', 'V\u00f2ng 1/16', '2026-07-02T20:00:00Z'),
  knockoutMatch(85, 'round32', 'V\u00f2ng 1/16', '2026-07-02T23:00:00Z'),
  knockoutMatch(86, 'round32', 'V\u00f2ng 1/16', '2026-07-03T17:00:00Z'),
  knockoutMatch(87, 'round32', 'V\u00f2ng 1/16', '2026-07-03T20:00:00Z'),
  knockoutMatch(88, 'round32', 'V\u00f2ng 1/16', '2026-07-03T23:00:00Z'),
  knockoutMatch(89, 'round16', 'V\u00f2ng 1/8', '2026-07-04T20:00:00Z'),
  knockoutMatch(90, 'round16', 'V\u00f2ng 1/8', '2026-07-04T23:00:00Z'),
  knockoutMatch(91, 'round16', 'V\u00f2ng 1/8', '2026-07-05T20:00:00Z'),
  knockoutMatch(92, 'round16', 'V\u00f2ng 1/8', '2026-07-05T23:00:00Z'),
  knockoutMatch(93, 'round16', 'V\u00f2ng 1/8', '2026-07-06T20:00:00Z'),
  knockoutMatch(94, 'round16', 'V\u00f2ng 1/8', '2026-07-06T23:00:00Z'),
  knockoutMatch(95, 'round16', 'V\u00f2ng 1/8', '2026-07-07T20:00:00Z'),
  knockoutMatch(96, 'round16', 'V\u00f2ng 1/8', '2026-07-07T23:00:00Z'),
  knockoutMatch(97, 'quarter', 'T\u1ee9 k\u1ebft', '2026-07-09T20:00:00Z'),
  knockoutMatch(98, 'quarter', 'T\u1ee9 k\u1ebft', '2026-07-10T20:00:00Z'),
  knockoutMatch(99, 'quarter', 'T\u1ee9 k\u1ebft', '2026-07-11T17:00:00Z'),
  knockoutMatch(100, 'quarter', 'T\u1ee9 k\u1ebft', '2026-07-11T20:00:00Z'),
  knockoutMatch(101, 'semi', 'B\u00e1n k\u1ebft', '2026-07-14T20:00:00Z'),
  knockoutMatch(102, 'semi', 'B\u00e1n k\u1ebft', '2026-07-15T20:00:00Z'),
  knockoutMatch(103, 'third', 'H\u1ea1ng ba', '2026-07-18T20:00:00Z'),
  knockoutMatch(104, 'final', 'Chung k\u1ebft', '2026-07-19T20:00:00Z'),
];

const YES_NO_OPTIONS = [choice('Co', 'Có'), choice('Khong', 'Không')];
const ODD_EVEN_OPTIONS = [choice('Chan', 'Chẵn'), choice('Le', 'Lẻ')];
const WIN_DRAW_OPTIONS = [choice('Co', 'Có'), choice('Khong', 'Không'), choice('Hoa', 'Hòa')];

export const DAILY_QUESTIONS = [
  question('2026-06-11', 'Trận khai mạc có từ 3 bàn thắng trở lên không?', YES_NO_OPTIONS, '2026-06-11T18:30:00Z'),
  question('2026-06-12', 'Tổng số bàn thắng trong ngày trong ngày mai13/06 là chẵn hay lẻ?', ODD_EVEN_OPTIONS, '2026-06-12T16:59:59Z'),
  question('2026-06-13', 'Ngày trong ngày mai14/06 có trận nào hòa không?', YES_NO_OPTIONS, '2026-06-13T16:59:59Z'),
  question('2026-06-14', 'Đội nào ghi nhiều bàn nhất ngày ngày trong ngày mai15/06?', null, '2026-06-14T16:59:59Z'),
  question('2026-06-15', 'Ngày trong ngày mai16/06 có thẻ đỏ không?', YES_NO_OPTIONS, '2026-06-15T16:59:59Z'),
  question('2026-06-16', 'Trận nào nhiều bàn nhất ngày ngày trong ngày mai17/06?', null, '2026-06-16T16:59:59Z'),
  question('2026-06-17', 'Tổng số trận giữ sạch lưới trong ngày trong ngày mai18/06 là chẵn hay lẻ?', ODD_EVEN_OPTIONS, '2026-06-17T16:59:59Z'),
  question('2026-06-18', 'Chủ nhà Canada có thắng Qatar không?', WIN_DRAW_OPTIONS, '2026-06-18T16:59:59Z'),
  question('2026-06-19', 'Ngày trong ngày mai20/06 có đội nào ghi từ 3 bàn trở lên không?', YES_NO_OPTIONS, '2026-06-19T16:59:59Z'),
  question('2026-06-20', 'Đội nào sẽ giữ sạch lưới thuyết phục nhất ngày trong ngày mai21/06?', null, '2026-06-20T16:59:59Z'),
  question('2026-06-21', 'Tổng số bàn thắng trong ngày trong ngày mai22/06 có vượt 10 không?', YES_NO_OPTIONS, '2026-06-21T16:59:59Z'),
  question('2026-06-22', 'Ngày trong ngày mai23/06 có bất ngờ lớn không?', YES_NO_OPTIONS, '2026-06-22T16:59:59Z'),
  question('2026-06-23', 'Trận nào có bàn thắng muộn nhất 24/06?', null, '2026-06-23T16:59:59Z'),
  question('2026-06-24', 'Bảng nào kịch tính nhất trong ngày 25/06 chốt lượt?', [choice('B'), choice('C')], '2026-06-24T16:59:59Z'),
  question('2026-06-25', 'Đội lớn nào sẽ gây thất vọng nhất ngày trong ngày mai26/06?', null, '2026-06-25T16:59:59Z'),
  question('2026-06-26', 'United States có thắng Turkey không?', WIN_DRAW_OPTIONS, '2026-06-26T16:59:59Z'),
  question('2026-06-27', 'Ngày trong ngày mai28/06 có tổng bàn thắng là chẵn hay lẻ?', ODD_EVEN_OPTIONS, '2026-06-27T16:59:59Z'),
];

function match(matchNo, group, homeTeam, awayTeam, kickoffAt) {
  return {
    matchNo,
    stage: 'group',
    group,
    homeTeam,
    awayTeam,
    kickoffAt,
    matchDay: dateKeyInVietnamTimeZone(kickoffAt),
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
  };
}

function knockoutMatch(matchNo, stage, stageLabel, kickoffAt) {
  return {
    matchNo,
    stage,
    stageLabel,
    group: stage,
    homeTeam: 'Unknown',
    awayTeam: 'Unknown',
    kickoffAt,
    matchDay: dateKeyInVietnamTimeZone(kickoffAt),
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
  };
}

function question(date, prompt, options, closesAt) {
  return {
    key: `q-${date}`,
    date,
    prompt,
    options,
    closesAt: closesAt || dailyQuestionLockAt(date),
    correctAnswer: null,
    points: 2,
  };
}

function dailyQuestionLockAt(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  if (!year || !month || !day) return `${date}T00:00:00+07:00`;
  return new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0)).toISOString();
}

function choice(value, label = value) {
  return { value, label };
}

function compareTeamsByFifaRank(left, right) {
  const leftRank = TEAM_META[left]?.fifaRank ?? Number.POSITIVE_INFINITY;
  const rightRank = TEAM_META[right]?.fifaRank ?? Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) return leftRank - rightRank;
  const leftName = TEAM_META[left]?.viName || left;
  const rightName = TEAM_META[right]?.viName || right;
  return normalizeForSort(leftName).localeCompare(normalizeForSort(rightName), 'vi');
}

function splitSquadPlayers(value) {
  const seen = new Set();
  return String(value || '')
    .split(',')
    .map(cleanSquadPlayerName)
    .filter((name) => {
      const key = normalizeForSort(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanSquadPlayerName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;]+$/g, '')
    .trim();
}

function compareScorers(left, right) {
  return normalizeForSort(left.label).localeCompare(normalizeForSort(right.label), 'vi')
    || normalizeForSort(left.nationality).localeCompare(normalizeForSort(right.nationality), 'vi');
}

function team(flag, fifaCode, fifaRank, viName) {
  return {
    flag,
    fifaCode,
    fifaRank,
    viName,
    flagUrl: `https://api.fifa.com/api/v3/picture/flags-sq-3/${fifaCode}`,
  };
}

function scorer(name, teamKey) {
  const meta = TEAM_META[teamKey] || TEAM_META.Unknown;
  const nationality = meta.viName || teamKey;
  const alias = name.replace(/\bJr\b\.?/gi, 'Junior');
  const value = `${name} · ${nationality}`;
  return {
    name,
    team: teamKey,
    nationality,
    flag: meta.flag || '',
    value,
    label: name,
    searchText: `${name} ${alias} ${teamKey} ${nationality} ${meta.fifaCode || ''}`.trim(),
  };
}

function normalizeForSort(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

export function dateKeyInVietnamTimeZone(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}
