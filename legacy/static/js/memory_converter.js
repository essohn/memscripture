
var raw_package_url = "https://docs.google.com/spreadsheet/pub?key=0AsS_FzZPvoCsdHV2ZktKTWpNbm5aQlI3UXlteUxaWnc&single=true&gid=2&output=txt";
var raw_index_url = "https://docs.google.com/spreadsheet/pub?key=0AsS_FzZPvoCsdHV2ZktKTWpNbm5aQlI3UXlteUxaWnc&single=true&gid=9&output=txt";


/////////////////////////////////////////////////////////////////////////////////////////////////////////// 

MemoryConverter.prototype.init = MemoryConverter_init;
MemoryConverter.prototype.retrieve_from_raw_text = MemoryConverter_retrieve_from_raw_text;
MemoryConverter.prototype.retrieve_from_raw_index = MemoryConverter_retrieve_from_raw_index;
MemoryConverter.prototype.download_json = MemoryConverter_download_json;
MemoryConverter.prototype.convert_raw_text_to_json  = MemoryConverter_convert_raw_text_to_json;
MemoryConverter.prototype.convert_raw_index_to_json  = MemoryConverter_convert_raw_index_to_json;

function MemoryConverter () 
{
	
}

function MemoryConverter_init () 
{
	
}

function MemoryConverter_retrieve_from_raw_text (text_url) {
	var self = this;

	console.log("Start retrieving a raw text from url: " + text_url);

	if (text_url) {
		$.ajax({
			type: "GET",
			url: text_url,
			dataType: "text",
			success: function(args) {
				console.log("the raw index reached successfully!");
//				console.log(self.convert_raw_text_to_json(args));
				self.convert_raw_text_to_json(args);
			}
		});
	}
}

function MemoryConverter_retrieve_from_raw_index (text_url) {
	var self = this;

	console.log("Start retrieving a raw index from url: " + text_url);

	if (text_url) {
		$.ajax({
			type: "GET",
			url: text_url,
			dataType: "text",
			success: function(args) {
				console.log("the raw text reached successfully!");
//				console.log(self.convert_raw_text_to_json(args));
				self.convert_raw_index_to_json(args);
			}
		});
	}
}

function MemoryConverter_convert_raw_text_to_json (memory_text) {
	var self = this;

	var package_names = ["그리스도와의 새출발 5구절", "그리스도와의 동행 8구절", "주제별 성경 암송 60구절", "확립 100구절", "주제별 성경 암송 180구절", "무장 900구절", "DEP 242구절"];
	var package_ids = ["5_krv", "8_krv", "60_krv", "100_krv", "180_krv", "900_krv", "242_krv"];
	var package_files = ["5_krv.json", "8_krv.json", "60_krv.json", "100_krv.json", "180_krv.json", "900_krv.json", "242_krv.json"];
	
	console.log("Start converting the raw text to json object.");
	
	var lines = memory_text.split(/\r\n|\r|\n/); 
	
	
	for (i in package_names) {
		var verses = [];
		var verse_no = 1;
		
		for (j in lines) {
			var res = lines[j].split("\t");
			var no = res[0];
			var pack = res[1];
			var index1 = res[2];
			var index2 = res[3];
			var index3 = res[4];
			var loc = res[5];
			var word = res[6];
			
			if (pack == package_names[i]) {
				var t = "";
				
				if (index3 == "") {
					t = index2;
				} else {
					t = index3;
				}
								
				verses.push({ i:verse_no, title: t, cite: loc, w: word });
				
				console.log(package_ids[i] + " - " + verse_no + " - inserted.");
				
				verse_no ++;
			}
		}
		
		self.download_json( package_files[i], JSON.stringify(verses, null, "\t") );
	}
	
}

function MemoryConverter_convert_raw_index_to_json (memory_index) {
	var self = this;

	var index_file = "packages_index_info.json";
	
	console.log("Start converting the raw index to json object.");
	
	var lines = memory_index.split(/\r\n|\r|\n/); 

	var index_items = [];
	
	for (i in lines) {
		var group = jQuery.parseJSON(lines[i]);
		
		var index_item = {};
		
		index_item["package_id"] = group["pid"];
		index_item["group_name"] = group["gname"];
		index_item["level"] = parseInt(group["level"]);
		index_item["index"] = [];
		for (j in group["index"]) {
				index_item["index"].push( parseInt(group["index"][j]) );
		}
		
		index_items.push( index_item );
	}
	
	self.download_json( index_file, JSON.stringify(index_items, null, "\t") );
	
}

function MemoryConverter_download_json (filename, json_data) {
	var self = this;

	console.log("Start downloading the json object.");

	window.URL = window.webkitURL || window.URL;

	var bb = new Blob([json_data], {type: "text/plain"});

	var a = document.createElement('a');

	a.download = filename;
	a.href = window.URL.createObjectURL(bb);
	a.textContent = 'Download ready';
	a.dataset.downloadurl = ["text/plain", a.download, a.href].join(':');
	a.draggable = true;
	a.classList.add('dragout');

	a.click();
  
};



