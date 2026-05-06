

function DEBUG (msg) {
	console.log(msg);
}

function LOG (msg) {
	console.log(msg);
}

function NOTIFY (msg) {
	console.log(msg);
	// $.notify( msg, {style: 'bootstrap', className: 'error', globalPosition: 'bottom left', autoHideDelay:5000});
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////// 

MemoryApp.prototype.init = MemoryApp_init;
MemoryApp.prototype.load_setting = MemoryApp_load_setting;
MemoryApp.prototype.goto_group = MemoryApp_goto_group;
MemoryApp.prototype.goto_bookmark = MemoryApp_goto_bookmark;
MemoryApp.prototype.prepare_a_card = MemoryApp_prepare_a_card;
MemoryApp.prototype.display_home = MemoryApp_display_home;
MemoryApp.prototype.display_settings = MemoryApp_display_settings;
MemoryApp.prototype.display_memory = MemoryApp_display_memory;
MemoryApp.prototype.display_index = MemoryApp_display_index;
MemoryApp.prototype.display_card_properties = MemoryApp_display_card_properties;
MemoryApp.prototype.make_verse_id = MemoryApp_make_verse_id;
MemoryApp.prototype.get_bookmark_class = MemoryApp_get_bookmark_class;
MemoryApp.prototype.open_verse_bookmark = MemoryApp_open_verse_bookmark;
MemoryApp.prototype.get_verse_bookmark = MemoryApp_get_verse_bookmark;
MemoryApp.prototype.set_verse_bookmark = MemoryApp_set_verse_bookmark;
MemoryApp.prototype.install_package = MemoryApp_install_package;
MemoryApp.prototype.install_all_packages = MemoryApp_install_all_packages;
MemoryApp.prototype.setup_click_event = MemoryApp_setup_click_event;
MemoryApp.prototype.font_size_plus = MemoryApp_font_size_plus;
MemoryApp.prototype.font_size_minus = MemoryApp_font_size_minus;
MemoryApp.prototype.font_size_default = MemoryApp_font_size_default;

MemoryApp.prototype.toggle_check = MemoryApp_toggle_check;


var memory_app_this = null;

function MemoryApp ()
{
	memory_app_this = this;
	this.memory_db = new MemoryDB();

	this.default_font_size = 100;
	this.current_font_size = 100;
	this.max_font_size = 200;
	this.min_font_size = 80;

	this.packages_status = {};

	this.current_verse_view_mode = "temp";
	this.current_temp_verse_list = [];
	this.current_bookmark_verse_list = [];
	this.bookmark_list = {};
	
	this.opened_bookmark_div_id;

	this.hide_word = false;
}

function MemoryApp_init () {
	var self = this;
	
	
	if (! window.localStorage) {
		LOG("localStorage is not available!");

		$("#message_text").html( "<h4>로컬저장소를 사용할 수 없습니다!</h4>" + 
			"<p class='light'>(Private browsing 모드가 켜져있으면 암송구절을 저장할 수 없습니다..)</p>");
	};
	
	self.display_home();

	var loop_index = 0;
	
	self.memory_db.init( end_1 );
	
	function end_1(result) {
		if (result) {
			var p_info = self.memory_db.packages_info_list;
			
			if (Object.keys(p_info).length > 0) {
				var package_ids = Object.keys(p_info);
				self.memory_db.check_package_exists(package_ids[loop_index], end_2);
			} else {
				NOTIFY("ERROR: 기본 패키지가 존재하지 않습니다!")
			}
			
		} else {
			self.display_settings();
			NOTIFY("ERROR: 데이터를 읽어오는데 실패하였습니다. 인터넷 연결을 확인해주세요...")
		}
	}
	
	function end_2(result) {
		var p_info = self.memory_db.packages_info_list;
		var package_ids = Object.keys(p_info);

		// if a package exists
		if (result) {
			self.packages_status[package_ids[loop_index]] = true;
		} else {
			self.packages_status[package_ids[loop_index]] = false;
		}
		loop_index ++;
		
		if (loop_index < package_ids.length) {
			// continue
			self.memory_db.check_package_exists(package_ids[loop_index], end_2);
		} else {
			// end of the loop
			self.load_setting();
			
			if (self.current_verse_view_mode == "temp") {
				self.display_memory(self.current_verse_view_mode);
			} else {
				self.goto_bookmark(self.current_verse_view_mode);
			}
			
		}
	}
	
}

function MemoryApp_load_setting () {
	var self = this;

	// load last verse list
	var cur_verse_list = jQuery.parseJSON( localStorage.getItem("current_temp_verse_list") );

	if (cur_verse_list) {
		this.current_temp_verse_list = cur_verse_list;
		LOG("current package is loaded: " + cur_verse_list);
	}
	
	// load last verse mode
	cur_view_mode = localStorage.getItem("current_verse_view_mode");
	
	if (cur_view_mode) {
		this.current_verse_view_mode = cur_view_mode;
		LOG("current verse view mode is loaded: " + cur_view_mode);
	}

	// load font size
	var font_size = jQuery.parseJSON( localStorage.getItem("font_size") );

	this.current_font_size = this.default_font_size;

	if (font_size && font_size >= this.min_font_size && font_size <= this.max_font_size) {
		this.current_font_size = font_size;
		
		LOG("current_font_size is loaded: " + font_size);
	}
	
	// load bookmark
	var bookmark_list = localStorage.getItem( "bookmark_list" );	
	
	if (bookmark_list) {
		this.bookmark_list = jQuery.parseJSON(bookmark_list);
	}

	// toggle check
	hide_word = localStorage.getItem("hide_word");

	if (hide_word) {
		this.hide_word = hide_word;
	} else {
		hide_word = false;
	}
	
}


function MemoryApp_toggle_check() {
	var self = this;

	this.hide_word = ! this.hide_word;

	localStorage.setItem("hide_word", this.hide_word );

	if (this.hide_word) {
	  $(".the_word").css("color","white");
	} else {
	  $(".the_word").css("color","black");
	}

	console.log('Version - 3:54')
}

function MemoryApp_goto_bookmark (bookmark_kind) {
	var self = this;
	
	this.current_bookmark_verse_list.length = 0;
	
	for (var key in this.bookmark_list) {
		if (this.bookmark_list.hasOwnProperty(key)){
			var element = this.bookmark_list[key];

			if (!this.packages_status[element["package_id"]]) {
				continue;
			}
			
			if (element["bookmark"] == bookmark_kind) {
				var verse = {"package_id":element["package_id"], "no":element["no"]};
				this.current_bookmark_verse_list.push(verse);
			}
		}
	}
	
	this.display_memory(bookmark_kind);
}

function MemoryApp_goto_group (package_id, indices) {
	var self = this;
	
	this.current_temp_verse_list.length = 0;
	
	for (var i in indices) {
		this.current_temp_verse_list.push( {"package_id":package_id, "no": indices[i] });
	}
	
	this.display_memory("temp");
	
}

function MemoryApp_display_home () {
	$("#panel_home").show();
	$("#panel_settings").hide();
	$("#panel_packages").hide();
	$("#panel_cards" ).hide();
	
}


function MemoryApp_display_settings () {
	var self = this;
	
	var p_info = self.memory_db.packages_info_list;
	var i_info = self.memory_db.packages_index_info_list;

	$("#panel_home").hide();
	$("#panel_settings").show();
	$("#panel_packages").hide();
	$("#panel_cards" ).hide();
	
	var all_exists = true;
	for (key in p_info) {
		if (!self.packages_status[key]) {
			all_exists = false;
		}
	}
	
	var all_status;
	if (all_exists) {
		all_status = "<a id='btn_all_install' class='btn btn-small pull-right btn-disabled'>설치됨</a>";
	} else {
		all_status = "<a id='btn_all_install' onclick='javascript:memory_app_this.install_all_packages();' class='btn btn-info btn-small pull-right'>모두 설치</a>";
	}
	
	var p_html = "<h5 class='light'>글자크기 조절</h5>" +
	"<div class='text-box'><a onclick='javascript:memory_app_this.font_size_plus();' class='btn btn-small btn-info'><i class='icon-plus'></i> 크게</a> " +
	"<a onclick='javascript:memory_app_this.font_size_minus();' class='btn btn-small btn-info'><i class='icon-minus'></i> 작게</a>" + 
	"<a onclick='javascript:memory_app_this.font_size_default();' class='btn btn-small btn-info'><i class='icon-back'></i> 기본크기로</a></div>";
	
	
	p_html = p_html + "<h5 class='light'>암송 패키지 설치</h5>" +
	"<table class='table table-bordered text-middle'>" +
    "<thead>" +
      "<tr>" +
        "<th>전체 패키지 목록" + all_status + "</th>" +
      "</tr>" +
    "</thead>" +
    "<tbody>";
		
	for (key in p_info) {
		if (p_info.hasOwnProperty(key)) {
			var installed_status;
			if (self.packages_status[key]) {
				installed_status = "<a id='btn_install" + key + "' class='btn btn-small pull-right btn-disabled'>설치됨</a>";
			} else {
				installed_status = "<a id='btn_install" + key + "' onclick='javascript:memory_app_this.install_package(\""+key+"\");' class='btn btn-info btn-small pull-right'>설치되지 않음</a>";
			}
			p_html = p_html + "<tr><td>" + p_info[key]['name'] + installed_status + "</td></tr>";
		}
	}

	
  p_html = p_html + "</tbody></table>";

	$("#panel_settings_list").html(p_html);
	
}

function MemoryApp_prepare_a_card (package_id, verse) {

	var self = this;
	
	var p_info = self.memory_db.packages_info_list;
	var i_info = self.memory_db.packages_index_info_list;
	
	if (verse) {

		var no = verse["i"];
		var title = verse["title"];
		var cite = verse["cite"];
		var word = verse["w"];
		var package_name = p_info[package_id]["name"];

		
		var group1 = "";
		var group2 = "";
		var group1_i = 0; 
		var group2_i = 0;
		var group1_index = "";
		var group2_index = "";
		var group1_link_str = "";
		var group2_link_str = "";
		
		for (var i in i_info) {
			var group = i_info[i];
			if (group["package_id"] == package_id) {
				
				if ($.inArray(no, group["index"]) > -1 ) {
					
					if (group["level"] == 1) {
						group1_i = i;
						group1 = group["group_name"];
						group1_index = group["index"];
					}
					if (group["level"] == 2) {
						group2_i = i;
						group2 = group["group_name"];
						group2_index = group["index"];
					}
				}
			}
		}
		
		if (group1) {
			group1_link_str = "<a class='group_link_1' onclick='javascript:memory_app_this.display_index(\"a_index_" + group1_i  + "\");'></i> ";
		}
		if (group2) {
			group2_link_str = "<a class='group_link_2' onclick='javascript:memory_app_this.display_index(\"a_index_" + group2_i  + "\");'></i> ";
		}
		
		var pack_link_str = "onclick='javascript:memory_app_this.display_index(\"a_index_" + package_id + "\");'";
		
		var color_class = self.get_bookmark_class( self.get_verse_bookmark(package_id, no) );


		var card_html = 
		"<div class='col-6'>" + 
		"<div id='verse" + package_id + no + "' class='verse_container' style='font-size:" + self.current_font_size + "%'>" +
		
			"<div class='verse_card'>" +
				"<div class='verse_group2'>" + 
				group2_link_str +
				group2 + " </a> " +
				"</div>" +
				"<div class='verse_title'>" + 
				title + "</div>" +

				"<div class='verse_content'>" +
				"<p><b>" + cite + "</b></p>" +
				"<p class='the_word'>" + word + "</p>" +
				"</div>" +
		
				"<div class='verse_group1'>" + 
				group1_link_str +
				group1 + "</a></div>" +
				"<div class='verse_package'>" + 

				"<a class='group_link_3' " + pack_link_str + ">" + 
				package_name + "</a>" + 
				"<a class='verse_number'>" + no + "</a>" +
				"</div>" +
			"</div>" + 
		
			"<div class='verse_bookmark'>"
			"</div>" +
		
			"<div class='verse_rating'></div>" + 
			"<div class='verse_favorite'></div>" + 

		"</div>" + 
		"</div>";
		
		// var card_html = 
		// "<div class='col-6'>" + 
		// "<div id='verse" + package_id + no + "' class='verse_container' style='font-size:" + self.current_font_size + "%'>" +
		// 
		// 	"<div class='verse_card'>" +
		// 		"<div class='verse_group2'>" + 
		// 		group2_link_str +
		// 		group2 + " </a> " +
		// 		"</div>" +
		// 		"<div class='verse_title'>" + 
		// 		title + "</div>" +
		// 
		// 		"<div class='verse_content'>" +
		// 		"<p><b>" + cite + "</b></p>" +
		// 		"<p>" + word + "</p>" +
		// 		"</div>" +
		// 
		// 		"<div class='verse_group1'>" + 
		// 		group1_link_str +
		// 		group1 + "</a></div>" +
		// 		"<div class='verse_package'>" + 
		// 
		// 		"<a class='group_link_3' " + pack_link_str + ">" + "<i class='icon-archive'></i> " + 
		// 		package_name + "</a>" + 
		// 		"<a class='verse_number'>" + no + "</a>" +
		// 		"</div>" +
		// 	"</div>" + 
		// 
		// 	"<div class='verse_bookmark'>"
		// 	"</div>" +
		// 
		// 	"<div class='verse_rating'></div>" + 
		// 	"<div class='verse_favorite'></div>" + 
		// 
		// "</div>" + 
		// "</div>";
									
		return card_html;
	}
}

function MemoryApp_display_card_properties () {
	var self = this;
	
	var v_list;
	
	if (self.current_verse_view_mode == "temp") {
		v_list = self.current_temp_verse_list;
	} else if (self.current_verse_view_mode == "new") {
		v_list = self.current_bookmark_verse_list;
	} else if (self.current_verse_view_mode == "cur") {
		v_list = self.current_bookmark_verse_list;
	} else if (self.current_verse_view_mode == "old") {
		v_list = self.current_bookmark_verse_list;
	}
	
	for (var i in v_list) {
		
		var package_id = v_list[i]["package_id"];
		var no = v_list[i]["no"];
		var color = self.get_bookmark_class( self.get_verse_bookmark(package_id, no) );
		
		var verse_div_id = "verse" + package_id + no;
		var bookmark_div_id = verse_div_id + " .verse_bookmark";
		var bookmark_div = $("#" + bookmark_div_id );
		
		var btn_toolbar_str;
		
		if (self.opened_bookmark_div_id == bookmark_div_id ) {
			btn_toolbar_str = "<a class='btn_bookmark' onclick='javascript:memory_app_this.set_verse_bookmark(\"" + package_id + "\"," + no + ",\"" + "no" + "\");'><i class='icon-bookmark color-no'></i></a>" +
	    "<a class='btn_bookmark' onclick='javascript:memory_app_this.set_verse_bookmark(\"" + package_id + "\"," + no + ",\"" + "new" + "\");'><i class='icon-bookmark color-new'></i></a>" +
	    "<a class='btn_bookmark' onclick='javascript:memory_app_this.set_verse_bookmark(\"" + package_id + "\"," + no + ",\"" + "cur" + "\");'><i class='icon-bookmark color-cur'></i></a>" +
	    "<a class='btn_bookmark' onclick='javascript:memory_app_this.set_verse_bookmark(\"" + package_id + "\"," + no + ",\"" + "old" + "\");'><i class='icon-bookmark color-old'></i></a>";
		} else {
			btn_toolbar_str = "<a class='btn_bookmark' onclick='javascript:memory_app_this.open_verse_bookmark(\"" + bookmark_div_id + "\");'><i class='icon-bookmark " + color + "'></i></a>";
		}
	
		bookmark_div.html(btn_toolbar_str);	
	}

}

function MemoryApp_display_memory (verse_view_mode) {

	var self = this;
	
	var prev_group = 0;
	var next_group = 0;
	
	if (! self.memory_db.packages_info_list || self.memory_db.packages_info_list.length == 0) {
		$("#message_text").html( "<h4>패키지 정보를 읽어올 수 없습니다!</h4>");
		
		return;
	}

	$("#panel_home").hide();
	$("#panel_settings").hide();
	$("#panel_packages").hide();
	$("#panel_cards" ).show();

	$("#panel_cards" ).empty();
	
	var v_list;
	
	self.current_verse_view_mode = verse_view_mode;
	
	if (self.current_verse_view_mode == "temp") {
		v_list = self.current_temp_verse_list;
		$("#panel_cards").append("<h4 class='header light'><i class='icon-flag'></i>  임시 암송구절</h4>");
	} else if (self.current_verse_view_mode == "new") {
		v_list = self.current_bookmark_verse_list;
		$("#panel_cards").append("<h4 class='header light'><i class='icon-bookmark color-new'></i> NEW</h4>");
	} else if (self.current_verse_view_mode == "cur") {
		v_list = self.current_bookmark_verse_list;
		$("#panel_cards").append("<h4 class='header light'><i class='icon-bookmark color-cur'></i> CURRENT</h4>");
	} else if (self.current_verse_view_mode == "old") {
		v_list = self.current_bookmark_verse_list;
		$("#panel_cards").append("<h4 class='header light'><i class='icon-bookmark color-old'></i> OLD</h4>");
	}

	if (v_list.length == 0) {
		$("#panel_cards").append("<div class='text-box'><h5 class='text-warning'>표시할 암송구절이 없습니다!</h5><p class='light'>암송구절을 선택해주세요.</p></div>");
		return;
	}

	var verse_index = 0;
	var result_list = [];
	
	var callback = function (verse) {
		result_list.push(verse);
		verse_index ++;

		if (verse_index < v_list.length) {
			// read next verse
			self.memory_db.read_verse( v_list[verse_index], callback );		
		} else {
			// reading is done

			for (var i in result_list) {

				var package_id = v_list[i]["package_id"];
			  var no = result_list[i]["i"];
								
				var card_html = self.prepare_a_card( package_id, result_list[i] );
				
				$("#panel_cards").append( card_html );
								
			} // end for
			
			// display card properties
			self.display_card_properties();
			
			// save to localStorage
			if (self.current_verse_view_mode == "temp") {
				localStorage.setItem("current_temp_verse_list", JSON.stringify(self.current_temp_verse_list));
			}
			
			// save current verse view mode
			localStorage.setItem("current_verse_view_mode", self.current_verse_view_mode);
			
			// window.location.href = "#panel_cards";
		}
	}
	
	if (v_list.length >= 1) {
		self.memory_db.read_verse( v_list[verse_index], callback );		
	}
	
}

function MemoryApp_display_index (link_id) {
	
	var self = this;
		
	var p_info = self.memory_db.packages_info_list;
	var i_info = self.memory_db.packages_index_info_list;

	$("#panel_home").hide();
	$("#panel_settings" ).hide();
	$("#panel_packages").show();
	$("#panel_cards" ).hide();
	
	$("#panel_packages_buttons").html("<h5 class='light'>설치된 패키지:</h5>");
	
	for (key in p_info) {
		if (p_info.hasOwnProperty(key)) {
			if (self.packages_status[key]) {
				// $("#panel_packages_buttons").append(" <a href='javascript:memory_app_this.display_index(\"" + key + "\");' class='btn btn-info btn-small'>" + p_info[key]["name"] + "</a> ");				
				$("#panel_packages_buttons").append(" <a href='#a_index_" + key + "' class='btn btn-info btn-small'>" + p_info[key]["name"] + "</a> ");				
			}
		}
	}

	var loaded_packages_num = 0;
	for (var i in self.packages_status) {
		if (self.packages_status[i]) {
			loaded_packages_num ++;
		}
	}
	
	if (loaded_packages_num > 0) {
		$("#panel_packages_index").html("<h5 class='light'>인덱스를 선택하세요.</h5><ul class='nav nav-bordered' id='panel_packages_index_ul'></ul>");
	} else {
		$("#panel_packages_index").html("<h5 class='text-warn light'>패키지를 먼저 설치하세요!</h5>");
	}

	$("#panel_packages_index_ul").empty();

	var old_package = "";
	
	for (var i in i_info) {
		
		var level_class = "";
		var indent = "";
		
		if (i_info[i]["level"] == 1) {
			level_class = "level_1"
			indent = "<i class='icon-inbox'></i> &nbsp;";
		} else if (i_info[i]["level"] == 2) {
			level_class = "level_2"
			indent = "&nbsp; &nbsp; <i class='icon-tag'></i> &nbsp;";
		}
		
		if (! self.packages_status[i_info[i]["package_id"]]) {
			continue;
		}
		
		if (old_package != i_info[i]["package_id"]) {
			$("#panel_packages_index_ul").append("<li><a id='a_index_" + i_info[i]["package_id"] + "' class='package_title text-info'><i class='icon-archive'></i> &nbsp;<small>" + p_info[i_info[i]["package_id"]]["name"] + "</small></a></li>");
			old_package = i_info[i]["package_id"];
		}
		$("#panel_packages_index_ul").append("<li><a id='a_index_" + i + "' class='" + level_class + "' href='javascript:memory_app_this.goto_group(\"" + i_info[i]["package_id"] + "\", [" + i_info[i]["index"] + "]);'><small>" + indent + i_info[i]["group_name"] + "</small></a></li>");			
		
	}
	
	if (link_id) {
		window.location.href = "#" + link_id;
	}
}

function MemoryApp_make_verse_id (verse) {
	return 'v_' + verse["i"][0].toString() + "_" + verse["i"][1].toString() + "_" + verse["i"][2].toString();
}

function MemoryApp_make_group_text (group) {
	return g_book_title_kr[group[0]] + " " + group[1];
}

function MemoryApp_get_bookmark_class (bookmark) {
	if ( bookmark) {
		if (bookmark["bookmark"] == "new") {
			return "color-new";
		} else if (bookmark["bookmark"] == "cur") {
			return "color-cur";
		} else if (bookmark["bookmark"] == "old") {
			return "color-old";
		} else {
			return "color-no";
		}
		
	} else {
		return "color-no";
	}
}

function MemoryApp_open_verse_bookmark (bookmark_div_id) {
	var self = this;
	
	this.opened_bookmark_div_id = bookmark_div_id;
	
	if (bookmark_div_id) {
		
		$(document).bind('click', function () {

			$(document).unbind('click');
		  $('#' + bookmark_div_id).unbind('click');
			
	    self.opened_bookmark_div_id = "";
			self.display_card_properties();
	  });
	
	  $('#' + bookmark_div_id).bind('click', function (event) {
	    event.stopPropagation();
	  });
	}

	this.display_card_properties();
}

function MemoryApp_get_verse_bookmark (package_id, no) {
	return this.bookmark_list[ package_id + no ];
}

function MemoryApp_set_verse_bookmark (package_id, no, bookmark) {
	var element = {"package_id":package_id, "no":no, "bookmark":bookmark};
		
	this.bookmark_list[ package_id + no ] = element;
	
	localStorage.setItem( "bookmark_list", JSON.stringify(this.bookmark_list) );	
	
	this.opened_bookmark_div_id = "";

	this.display_card_properties();
	
}

function MemoryApp_show_bookmark_buttons (package_id, no) {
	
}

function MemoryApp_install_package(package_id, callback) {
	var self = this;

	var btn_id = "btn_install" + package_id;
	
	$("#" + btn_id).html("설치 중 입니다...");
	
	self.memory_db.install_package(package_id, end_1);
	
	function end_1(result) {
		if (result) {
			$("#" + btn_id).text = "설치됨";

			self.memory_db.load_package(package_id);
			self.packages_status[package_id] = true;
		
			self.display_settings();
			
			if (callback) {
				callback(true);	
			}
			
			
		} else {
			$("#" + btn_id).text = "설치에 실패하였습니다!";
			if (callback) {
				callback(false);
			}
		}
	}
}

function MemoryApp_install_all_packages() {
	var self = this;

	var loop_index = 0;
		
	var p_info = self.memory_db.packages_info_list;
	var p_keys = Object.keys(p_info);

	if (p_keys.length > 0) {
		if (self.packages_status[ p_keys[loop_index] ]) {
			end_1(true);
		} else {
			self.install_package( p_keys[loop_index], end_1 );			
		}
	}
	
	function end_1(result) {
		loop_index ++;
		if (loop_index < p_keys.length) {
			self.install_package( p_keys[loop_index], end_1 );
		}
	}	
}

function MemoryApp_setup_click_event () {
	var self = this;

	
}

function MemoryApp_font_size_plus (event) {
	var self = memory_app_this;

	self.current_font_size += 10;
	if (self.current_font_size >= self.max_font_size) {
		self.current_font_size = self.max_font_size;
	}
	
	localStorage.setItem("font_size", self.current_font_size);	
	
}

function MemoryApp_font_size_minus (event) {
	var self = memory_app_this;
	
	self.current_font_size -= 10;
	if (self.current_font_size <= self.min_font_size) {
		self.current_font_size = self.min_font_size;
	}

	localStorage.setItem("font_size", self.current_font_size);	
	
}

function MemoryApp_font_size_default (event) {
	var self = memory_app_this;
	
	self.current_font_size = 100;

	localStorage.setItem("font_size", self.current_font_size);	
	
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////// 

MemoryDB.prototype.init = MemoryDB_init;
MemoryDB.prototype.get_packages_info = MemoryDB_get_packages_info;
MemoryDB.prototype.get_packages_index_info = MemoryDB_get_packages_index_info;
MemoryDB.prototype.check_db_exists = MemoryDB_check_db_exists;
MemoryDB.prototype.check_package_exists = MemoryDB_check_package_exists;
MemoryDB.prototype.install_package = MemoryDB_install_package;
MemoryDB.prototype.load_package = MemoryDB_load_package;
MemoryDB.prototype.read_verse = MemoryDB_read_verse;
MemoryDB.prototype.make_all_indices = MemoryDB_make_all_indices;

function MemoryDB () 
{
	this.idb = window.indexedDB;
	this.packages_info_list;
	this.packages_index_info_list;
	this.packages = {};
}

function MemoryDB_init (callback) 
{
	var self = this;

	
	self.get_packages_info(end_1);
	
	function end_1(result) {
		if (result) {
			self.get_packages_index_info(end_2);	
		} else {
			LOG("get_packages_info failed.");
		}
	}
	
	function end_2(result) {
		if (result) {
			self.check_db_exists(end_3);	
		} else {
			LOG("get_packages_index_info failed.");
		}
	}
	
	function end_3(result) {
		if (result) {
			callback(result);
		} else {
			LOG("check_db_exists failed.");
		}
	}
	
}

function MemoryDB_get_packages_info (callback) {
	var self = this;

	LOG("try to load packages_info_list from the localStorage.");

	//load from localStorage first
	var list = jQuery.parseJSON( localStorage.getItem("packages_info_list") );
	
	if (list) {
		self.packages_info_list = list;
		LOG("packages_info_list is loaded from the localStorage.")
		callback(true);
		
	} else {
		// get packages info from dropbox repository
		$.ajax( { type: "GET", url: packages_info_json_dropbox, dataType: "text",
		success: function(args) {
			self.packages_info_list = jQuery.parseJSON(args);
			LOG("packages_info_list is loaded from the remote repository.")
			
			localStorage.setItem("packages_info_list", JSON.stringify(self.packages_info_list));
			callback(true);
		},
		error: function(xhr, option, error) {
			LOG(xhr.status + " - " + error);
			callback(false);
		}
		});
	}
}

function MemoryDB_get_packages_index_info (callback) {
	var self = this;

	LOG("try to load packages_index_info_list from the localStorage.");
	
	// load from localStorage first
	var list = jQuery.parseJSON( localStorage.getItem("packages_index_info_list") );
	
	if (list) {
		if (list.length != 245) {
			localStorage.removeItem("packages_index_info_list");
			LOG("remove old one...");
			list = 0;
		}
	}
	
	if (list) {
		self.packages_index_info_list = list;
		LOG("packages_info_list is loaded from the localStorage.")
		callback(true);
	} else {
		// get packages info from dropbox repository
		$.ajax( { type: "GET", url: packages_index_info_json_dropbox, dataType: "text",
		success: function(args) {
			self.packages_index_info_list = jQuery.parseJSON(args);
			LOG("packages_index_info_list is loaded from the remote repository.")

			localStorage.setItem("packages_index_info_list", JSON.stringify(self.packages_index_info_list));
			callback(true);
		},
		error: function(xhr, option, error) {
			LOG(xhr.status + " - " + error);
			callback(false);
		}
		});
	}
}

function MemoryDB_check_db_exists (callback) {

	var self = this;
	
	callback(true);

	// var request = self.idb.open("packages");
	// 
	//   request.onsuccess = function(event) {
	// 	callback(true);
	// }
	// 
	// request.onerror = function(event) {
	// 	callback(false);
	// }
}

function MemoryDB_check_package_exists (package_id, callback) {

	var self = this;

	var pack = localStorage.getItem("package" + package_id);
	
	if (pack) {
		self.load_package(package_id);
		callback(true);
	} else {
		callback(false);
	}
	
	// var request = self.idb.open("packages");
	// 
	//   request.onsuccess = function(event) {
	// 	var db = event.target.result;
	// 	if (db.objectStoreNames.contains(package_id)) {
	// 		callback(true);
	// 	} else {
	// 		callback(false);
	// 	}
	// }
	// 
	// request.onerror = function(event) {
	// 	callback(false);
	// }
}

function MemoryDB_install_package (package_id, callback) {
	var self = this;
	
	if (package_id) {
		$.ajax({
	        type: "GET", 
	        url: self.packages_info_list[package_id]["source"],
	        dataType: "text",
	        success: function(args) {
						
						localStorage.setItem("package" + package_id, args);
						
						callback(true);
	        }
	    });
	}
}

function MemoryDB_load_package (package_id) {
	var self = this;
	
	var pack = localStorage.getItem("package" + package_id);

	if (pack) {
		self.packages[package_id] = jQuery.parseJSON(pack);
	}
}

function MemoryDB_read_verse ( verse, callback ) {
	var self = this;

	if (self.packages[verse["package_id"]]) {
		var index = parseInt(verse["no"]) -1;
		callback(self.packages[verse["package_id"]][index]);
	}
}

function MemoryDB_make_all_indices () {
	var self = this;

}
