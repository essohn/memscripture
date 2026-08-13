/**
 * Created by sohn on 1/20/14.
 */

var bibles_info_json_dropbox = "https://dl.dropboxusercontent.com/u/97688/wbible/bibles_info.json";


// Class Bible

g_book_chapter_number = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];

g_book_title_abbr_kr = ['창','출','레','민','신','수','삿','룻','삼상','삼하','왕상','왕하','대상','대하','스','느','에','욥','시','잠','전','아','사','렘','애','겔','단',
                     '호','욜','암','옵','욘','미','나','합','습','학','슥','말','마','막','눅','요','행','롬','고전','고후','갈','엡','빌','골','살전','살후','딤전',
                     '딤후','딛','몬','히','약','벧전','벧후','요일','요이','요삼','유','계'];

g_book_title_kr = ['창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','롯기','사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미아',
       '에스더','욥기','시편','잠언','전도서','아가','이사야','예레미야','예레이야애가','에스겔','다니엘','호세아','요엘','아모스','오바댜','요나','미가','나훔',
       '하박국','스바나','학개','스가랴','말라기','마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서','갈라디아서','에베소서',
       '빌립보서','골로새서','데살로니가전서','데살로니가후서','디모데전서','디모데후서','디도서','빌레몬서','히브리서','야고보서','베드로전서','베드로후서','요한일서',
       '요한이서','요한삼서','유다서','요한계시록'];

g_book_group = [[0, 5], [5, 12], [17, 5], [22, 5], [27, 12], [39, 4], [43, 1], [44, 13], [57, 8], [65, 1]];

g_book_key_code_map_kr = {"ckd":0,"ckdtprl":0,"cnf":1,"cnfdornqrl":1,"fp":2,"fpdnlrl":2,"als":3,"alstnrl":3,"tls":4,"tlsaudrl":4,"tn":5,"dughtndk":5,"tkt":6,"tktkrl":6,"fnt":7,"fntrl":7,"tkatkd":8,"tkandpftkd":8,"tkagk":9,"tkandpfgk":9,"dhkdtkd":10,"dufdhkdrltkd":10,"dhkdgk":11,"dufdhkdrlgk":11,"eotkd":12,"dureotkd":12,"eogk":13,"dureogk":13,"tm":14,"dptmfk":16,"sm":15,"smgpaldi":15,"dp":16,"dyq":17,"dyqrl":17,"tl":18,"tlvus":18,"wka":19,"wkadjs":19,"wjs":20,"wjsehtj":20,"dk":21,"dkrktj":21,"tk":22,"dltkdi":22,"fpa":23,"dPfpaldi":23,"do":24,"dPfpaldidork":24,"rpf":25,"dptmrpf":25,"eks":26,"eksldpf":26,"gh":27,"ghtpdk":27,"dyf":28,"dydpf":28,"dka":29,"dkahtm":29,"dhq":30,"dhqkei":30,"dys":31,"dysk":31,"al":32,"alrk":32,"sk":33,"slgna":33,"gkq":34,"gkqkrrnr":34,"tmq":35,"tmqksi":35,"gkr":36,"gkrro":36,"tmr":37,"tmrkfi":37,"akf":38,"akffkrl":38,"ak":39,"akxoqhrdma":39,"akr":40,"akrkqhrdma":40,"snr":41,"snrkqhrdma":41,"dy":42,"dygksqhrdma":42,"god":43,"tkehgodwjs":43,"fha":44,"fhaktj":44,"rhwjs":45,"rhflsehwjstj":45,"rhgn":46,"rhflsehgntj":46,"rkf":47,"rkffkeldktj":47,"dpq":48,"dpqpthtj":48,"qlf":49,"qlfflqqhtj":49,"rhf":50,"rhffhtotj":50,"tkfwjs":51,"eptkffhslrkwjstj":51,"tkfgn":52,"eptkffhslrkgntj":52,"elawjs":53,"elahepwjstj":53,"elagn":54,"elahepgntj":54,"ele":55,"elehtj":55,"ahs":56,"qlffpahstj":56,"gl":57,"glqmfltj":57,"dir":58,"dirhqhtj":58,"qpewjs":59,"qpemfhwjstj":59,"qpegn":60,"qpemfhgntj":60,"dydlf":61,"dygksdlftj":61,"dydl":62,"dygksdltj":62,"dytka":63,"dygkstkatj":63,"db":64,"dbektj":64,"rP":65,"dygksrPtlfhr":65} ;

		   
/////////////////////////////////////////////////////////////////////////////////////////////////////////// 

BibleApp.prototype.init = BibleApp_init;
BibleApp.prototype.load_setting = BibleApp_load_setting;
BibleApp.prototype.display_bible = BibleApp_display_bible;
BibleApp.prototype.on_scroll = BibleApp_on_scroll;
BibleApp.prototype.make_verse_id = BibleApp_make_verse_id;
BibleApp.prototype.make_chapter_text = BibleApp_make_chapter_text;
BibleApp.prototype.prev_chapter = BibleApp_prev_chapter;
BibleApp.prototype.next_chapter = BibleApp_next_chapter;
BibleApp.prototype.make_book_select_toolbar = BibleApp_make_book_select_toolbar;
BibleApp.prototype.init_layout = BibleApp_init_layout;
BibleApp.prototype.on_keydown = BibleApp_on_keydown;
BibleApp.prototype.on_click_verse = BibleApp_on_click_verse;
BibleApp.prototype.on_move_chapter_prev = BibleApp_on_move_chapter_prev;
BibleApp.prototype.on_move_chapter_next = BibleApp_on_move_chapter_next;
BibleApp.prototype.on_font_size_plus = BibleApp_on_font_size_plus;
BibleApp.prototype.on_font_size_minus = BibleApp_on_font_size_minus;

// BibleApp.prototype.scroll_load_prev_chapter = BibleApp_scroll_load_prev_chapter;
// BibleApp.prototype.scroll_load_next_chapter = BibleApp_scroll_load_next_chapter;

var bible_app_this = null;

function BibleApp ()
{
	bible_app_this = this;
	this.bible_db = new BibleDB();

	this.default_font_size = 130;
	this.current_font_size = 130;
	this.max_font_size = 200;
	this.min_font_size = 80;

	this.current_location = [65, 22];
	this.current_translation_1 = "krv";
	this.current_translation_2 = "nkrv";
	this.dual_view = false;

	this.key_buffer = [];
}

function BibleApp_init () {
	var self = this;
	
	var success_func = function () {
		self.display_bible();
	}

	this.bible_db.init( success_func );
	
	// $( "#book_select_toolbar" ).html( this.make_book_select_toolbar() );

	var clicks = function (event) {
		var elem = event.target.id.split("_");
		var bindex = parseInt(elem[2]);
		if (bindex >= 0 && bindex < 66) {
			self.current_location = [bindex, 1];
			self.display_bible();
		}
	}

	for (i=0; i<66; i++) {
		$( "#book_btn_" + i ).click(clicks);
	}
	
//	$( "#btn_chapter_cur" ).click( self.on_click_chapter );
	$( "#btn_chapter_prev" ).click( self.on_move_chapter_prev );
	$( "#btn_chapter_next" ).click( self.on_move_chapter_next );
	
	$( "#btn_font_size_plus" ).click( self.on_font_size_plus );
	$( "#btn_font_size_minus" ).click( self.on_font_size_minus );

	$( "#panel_bible .verse_list" ).click( self.on_click_verse );		
	
	
	$("body").append("<div></div>")
	
	// set keydown event
	$(document).on( "keydown", this.on_keydown );
	
	this.load_setting();

}

function BibleApp_load_setting () {
	// load last location
	var last_location = jQuery.parseJSON( localStorage.getItem("last_location") );

	this.current_location = [0, 1];

	if (last_location && last_location.length == 2) {
		if (last_location[0] >= 0 && last_location[0] <66 && last_location[1] >= 1) {
			this.current_location = last_location;
			console.log("current_location is loaded: " + last_location);
		}
	}

	// load font size
	var font_size = jQuery.parseJSON( localStorage.getItem("font_size") );

	this.current_font_size = this.default_font_size;

	if (font_size && font_size >= this.min_font_size && font_size <= this.max_font_size) {
		this.current_font_size = font_size;
		
		$("#panel_bible .verse_list").css("font-size", this.current_font_size + "%");
		
		console.log("current_font_size is loaded: " + font_size);
	}
	
	// load bible translation
}

function BibleApp_init_layout () {
	
}

function BibleApp_make_book_select_toolbar () {
	var self = this;

	var toolbar_str = "<table id='booknav_table'>\n";

	for (var i=0; i<27; i++) {
		var second_i = parseInt(i) + 27;
		var third_i = parseInt(i) + 39;
		
		toolbar_str += "\t<tr>";

		toolbar_str += "<td id='book_btn_" + i + "' class='filled'>";
		toolbar_str += g_book_title_abbr_kr[i];
		toolbar_str += "</td>";
		
		if (second_i < 39 ) {
			toolbar_str += "<td id='book_btn_" + second_i + "' class='filled'>";
			toolbar_str += g_book_title_abbr_kr[second_i];
			toolbar_str += "</td>";
		} else {
			toolbar_str += "<td></td>";
		}

		if (third_i < 66 ) {
			toolbar_str += "<td id='book_btn_" + third_i + "' class='filled'>";
			toolbar_str += g_book_title_abbr_kr[third_i];
			toolbar_str += "</td>";
		} else {
			toolbar_str += "<td></td>";
		}

		toolbar_str += "</tr>\n";
	}

	toolbar_str += "</table>\n";
	
	  		
	return toolbar_str;
}

function BibleApp_display_bible () {

	var self = this;
	
	var cur_ch = this.current_location;
	var prev_ch = this.prev_chapter( this.current_location );
	var next_ch = this.next_chapter( this.current_location );
		
	var callback = function (verses) {

		$( "#btn_chapter_cur" ).html( self.make_chapter_text(cur_ch) + " <span class='caret'></span>" );
		
		if (prev_ch) {
			$( "#btn_chapter_prev" ).attr("disabled", false);
		} else {
			$( "#btn_chapter_prev" ).attr("disabled", true);
		}
		
		if (next_ch) {
			$( "#btn_chapter_next" ).attr("disabled", false);
		} else {
			$( "#btn_chapter_next" ).attr("disabled", true);
		}
		
		console.log()
		
		$( "#panel_bible .verse_list" ).empty();
		
		for (i in verses) {
//			$( "#panel_bible .verse_list" ).append( "<li><span class=\"verse\" id=\"" + self.make_verse_id(verses[i]) + "\">" + verses[i]["w"] + "</span></li>" );
			$( "#panel_bible .verse_list" ).append( "<tr><td class='verse_number'>" + verses[i]["i"][2] + "</td><td><span class='verse' id='" + self.make_verse_id(verses[i]) + "'>" + verses[i]["w"] + "</span></td></tr>" );
		}
	}
	
	var range_1 = [this.current_location[0], this.current_location[1], 1];
	var range_2 = [this.current_location[0], this.current_location[1]+1, 1];

	this.bible_db.read_verses( this.current_translation_1, range_1, range_2, callback );
	
}

function BibleApp_on_scroll () {
}

function BibleApp_make_verse_id (verse) {
	return 'v_' + verse["i"][0].toString() + "_" + verse["i"][1].toString() + "_" + verse["i"][2].toString();
}

function BibleApp_make_chapter_text (chapter) {
	return g_book_title_kr[chapter[0]] + " " + chapter[1];
}

function BibleApp_prev_chapter (chapter) {
	var book = chapter[0];
	var chapter = chapter[1];
	
	if (chapter == 1) {
		book = book-1;
		chapter = g_book_chapter_number[book];
	} else {
		chapter -= 1;
	}
	
	if (book >= 0) {
		return [book, chapter];
	} else {
		return null;
	}
}

function BibleApp_next_chapter (chapter) {
	var book = chapter[0];
	var chapter = chapter[1];
	
	if (chapter == g_book_chapter_number[book]) {
		book = book+1;
		chapter = 1;
	} else {
		chapter += 1;
	}
	
	if (book < 66) {
		return [book, chapter];
	} else {
		return null;
	}
}

function BibleApp_on_keydown (event) {
	var self = bible_app_this;

	var ch_code = event.keyCode - 64 + 96;
	
	var key_buffer_clear = function () {
		self.key_buffer.length = 0; 
	}
	if ( self.key_buffer.length == 0 ) {
		setTimeout( key_buffer_clear, 2000);
	}

	self.key_buffer.push(ch_code);
	
	if (event.keyCode == 13) {
		self.key_buffer.length = 0;
	}
	
	if (self.key_buffer.length >= 1) {
		var bindex = suggest_location(self.key_buffer);
		if (bindex != -1) {
			
			$.notify("==> " + g_book_title_kr[bindex], {style: 'bootstrap', className: '', autoHideDelay:2000});
			
			self.current_location = [bindex, 1];
			self.display_bible();
		}
	}
}

function BibleApp_on_move_chapter_prev (event) {
	var self = bible_app_this;

	var location = self.prev_chapter( self.current_location );
	
	if (location && location.length == 2 && location[0] >= 0 && location[0] < 66 && location[1] >= 1) {

		self.current_location = location;
	
		self.display_bible();	
	
		localStorage.setItem("last_location", JSON.stringify(self.current_location));	
	}
}

function BibleApp_on_move_chapter_next (event) {
	var self = bible_app_this;

	var location = self.next_chapter( self.current_location );

	if (location && location.length == 2 && location[0] >= 0 && location[0] < 66 && location[1] >= 1) {

		self.current_location = location;
	
		self.display_bible();	
	
		localStorage.setItem("last_location", JSON.stringify(self.current_location));	
	}
}


function BibleApp_on_click_verse (event) {
	var self = bible_app_this;
	
	var v_id = event.target.id;
	
	if (v_id) {
		var res = make_location_text(parse_verse_id_to_location(v_id)) + " " + event.target.innerText;
	
		if (typeof appshell != "undefined") {
			appshell.app.copyToClipboard(res);
			$.notify( "<p style='font-weight:bold; color:#6BABBA'>클립보드에 복사되었습니다.</p>" + res, {style: 'wordhint', className: '', globalPosition: 'bottom left', autoHideDelay:2000});
		} else {
			$.notify( "브라우저에서는 클립보드 복사가 지원되지 않습니다.", {style: 'bootstrap', className: 'warn', globalPosition: 'bottom left', autoHideDelay:1000});
		}
	}
}

function BibleApp_on_font_size_plus (event) {
	var self = bible_app_this;

	self.current_font_size += 10;
	if (self.current_font_size >= self.max_font_size) {
		self.current_font_size = self.max_font_size;
	}
	
	$("#panel_bible .verse_list").css("font-size", self.current_font_size + "%");
	
	localStorage.setItem("font_size", self.current_font_size);	
	
}

function BibleApp_on_font_size_minus (event) {
	var self = bible_app_this;
	
	self.current_font_size -= 10;
	if (self.current_font_size <= self.min_font_size) {
		self.current_font_size = self.min_font_size;
	}

	$("#panel_bible .verse_list").css("font-size", self.current_font_size + "%");

	localStorage.setItem("font_size", self.current_font_size);	
	
}

function suggest_location (key_array) {
	var book_str_map = g_book_key_code_map_kr;
	
	for (var key in book_str_map) {
		if (book_str_map.hasOwnProperty(key)) {
			var ch_array_key = [];
			for (var i in key) {
				if ( key.charAt(i) == "P" ) {
					ch_array_key.push(48);
					ch_array_key.push(("p").charCodeAt(0));
				} else {
					ch_array_key.push(key.charCodeAt(i));
				}
			}

			// compare the two key arrays
			var match = true;
			for (var i in key_array) {
				if (i < ch_array_key.length) {
					if (key_array[i] != ch_array_key[i]) {
						match = false;
					}
				}
			}
			
			if (key_array.length == ch_array_key.length) {
				if (match) {
					return book_str_map[key];
				}
			} 
		}
	}
	
	return -1;
}

function parse_verse_id_to_location (verse_id) {
	var elem = verse_id.split("_");
	
	return [parseInt(elem[1]), parseInt(elem[2]), parseInt(elem[3])];
}

function make_location_text(location) {
	return "(" + g_book_title_abbr_kr[location[0]] + " " + location[1] + ":" + location[2] + ")";
}



/////////////////////////////////////////////////////////////////////////////////////////////////////////// 

BibleDB.prototype.init = BibleDB_init;
BibleDB.prototype.initiate_bible_retrieval = BibleDB_initiate_bible_retrieval;
BibleDB.prototype.check_existing_bible_db = BibleDB_check_existing_bible_db;
BibleDB.prototype.check_db_version = BibleDB_check_db_version;
BibleDB.prototype.insert_bible_to_db = BibleDB_insert_bible_to_db;
BibleDB.prototype.retrieve_bibles_from_index = BibleDB_retrieve_bibles_from_index;
BibleDB.prototype.clear_database = BibleDB_clear_database;
BibleDB.prototype.read_verses = BibleDB_read_verses;


function BibleDB () 
{
	this.idb = window.indexedDB;
	this.bibles_info_list = null;
	this.db_version = 0;
	this.next_bible_index_to_load = 0;
	this.init_done_callback = null
}

function BibleDB_init (success_func) {
	
	var self = this;
	
	this.init_done_callback = success_func;
	
	self.check_existing_bible_db();
}

function BibleDB_initiate_bible_retrieval () {

	var self = this;

	console.log("Start retrieving default bibles...");
	console.log("Get bibles' info from a dropbox repository: " + bibles_info_json_dropbox);

	// get bibles info from dropbox repository
    $.ajax( { type: "GET",
		url: bibles_info_json_dropbox,
		dataType: "text",
        success: function(args) {
			self.bibles_info_list = jQuery.parseJSON(args);
	
			self.next_bible_index_to_load = 0;
			self.retrieve_bibles_from_index();
		}
	});
}

function BibleDB_check_existing_bible_db () {

	var self = this;

	var request = self.idb.open("bibles");

    request.onsuccess = function(event) {
		var db = event.target.result;
		if (db.objectStoreNames.length == 0) {
			console.log("No bibles are found...");
			self.initiate_bible_retrieval();
		} else {
			console.log("Checking was successful. Existing bibles in db are: " + db.objectStoreNames.length );
			self.init_done_callback();
		}
	}
	
	request.onerror = function(event) {
		console.log("No database is found!");
		self.initiate_bible_retrieval();
	}
}

function BibleDB_check_db_version (next_func) {

	var self = this;

	var request = self.idb.open("bibles");

    request.onsuccess = function(event) {
        var db = event.target.result;
		self.db_version = db.version;
		console.log("Current DB version is " + self.db_version);
		
		next_func();
	}
}

function BibleDB_insert_bible_to_db (verses) {

	var self = this;
	
	var bindex = self.next_bible_index_to_load;
	
	var insert_func = function () {
		
		if (self.db_version == 0) {
			console.log("This is the first time creating db...");
		}

		console.log("Trying to open db...");
	
		var request = self.idb.open("bibles", self.db_version + 1);
	
	    request.onupgradeneeded = function (event) {
	        var db = event.target.result;
			var bible_id = self.bibles_info_list[bindex]["bible_id"];
		
			console.log("Begin updating database scheme...");

		    var verse_obj = db.createObjectStore( bible_id, { keyPath:"i" } );

			verse_obj.transaction.oncomplete = function (event) {
			
				console.log("A new object store was successfully created: " + bible_id);
			
				var obj_store = db.transaction( bible_id, "readwrite").objectStore( bible_id );

				for (var i in verses) {
					obj_store.add( verses[i] );
				}
			
				console.log("All verses are successfully inserted: " + bible_id);
			
				// next bible
				self.next_bible_index_to_load ++;
				
				self.retrieve_bibles_from_index();
			}
		}

		request.onerror = function (event, text) {
			console.log("error: " + text);
		}
	}
	
	self.check_db_version( insert_func );
	
}

function BibleDB_retrieve_bibles_from_index () {

	var self = this;
	var bindex = self.next_bible_index_to_load;
	
	if (bindex >= self.bibles_info_list.length) {
		// end of loading translations
		self.init_done_callback();
		
		return;
	}

	var bible_id = self.bibles_info_list[bindex]["bible_id"];
		
	console.log("Begin retrieving bible info " + bible_id);
		
    $.ajax({
        type: "GET", 
        url: self.bibles_info_list[bindex]["link"],
        dataType: "text",
        success: function(args) {
			var verses = jQuery.parseJSON(args);
			
			self.insert_bible_to_db(verses);
			
        }
    });
}


function BibleDB_clear_database() {
	
	var self = this;

	var request = self.idb.deleteDatabase("bibles");
	
	request.onsuccess = function(event) {
		console.log("Database 'bibles' was successfully removed.");
	}
	
	request.onerror = function(e, text) {
		console.log("Database 'bibles' was not removed.");
	}
}

function BibleDB_read_verses (bible_id, begin, end, callback) {

	var self = this;

	var request = self.idb.open("bibles");
	
	request.onsuccess = function(event) {
		var db = event.target.result;

		var boundKeyRange = IDBKeyRange.bound(begin, end, false, true);

		var transaction = db.transaction([bible_id]);
		var objectStore = transaction.objectStore(bible_id);

		var result_verses = [];
		
		request2 = objectStore.openCursor(boundKeyRange);
		
		request2.onsuccess = function(event) {

			var cursor = event.target.result;
			if (cursor) {
				result_verses.push(cursor.value);
				cursor.continue()
			} else {
				callback(result_verses);
			}
		}
	};
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////// 

