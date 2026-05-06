/////////////////////////////////////////////////////////////////////////////////////////////////////////// 

BibleConverter.prototype.init = BibleConverter_init;
BibleConverter.prototype.retrieve_from_raw_text = BibleConverter_retrieve_from_raw_text;
BibleConverter.prototype.download_json = BibleConverter_download_json;
BibleConverter.prototype.convert_raw_text_to_json  = BibleConverter_convert_raw_text_to_json;

function BibleConverter () 
{
	
}

function BibleConverter_init () 
{
	
}

function BibleConverter_retrieve_from_raw_text (text_url) {
	var self = this;

	console.log("Start retrieving a raw text from url: " + text_url);

	if (text_url) {
		$.ajax({
			type: "GET",
			url: text_url,
			dataType: "text",
			success: function(args) {
				console.log("the raw text reached successfully!");
				self.download_json( self.convert_raw_text_to_json(args) );
			}
		});
	}
}

function BibleConverter_convert_raw_text_to_json (bible_text) {
	var self = this;

	console.log("Start converting the raw text to json object.");
	
	var lines = bible_text.split(/\r\n|\r|\n/); 
	
	var words = [];
	var word2 = [];
	
	for (i in lines) {
		var res = lines[i].split("\t");
		var index = res[0];
		var word = res[1];
		
		var patt = /(^.*?(?=[0-9]))([0-9]*):([0-9]*)/;
		
		var tokens = patt.exec(index);
		var b_index;
		var c_index;
		var v_index;
		
		for (j=0; j< 66; j++) {
			if (tokens[1] == g_titles_abbr_kr[j]) {
				b_index = j;
			}
		}
		
		c_index = Number(tokens[2]);
		v_index = Number(tokens[3]);
		
		words.push({ i:[b_index, c_index, v_index], w:word });		
	}
	
	return JSON.stringify(words, null, "\t");
}

function BibleConverter_download_json (json_data) {
	var self = this;

	console.log("Start downloading the json object.");

	window.URL = window.webkitURL || window.URL;

	var bb = new Blob([json_data], {type: "text/plain"});

	var a = document.createElement('a');

	a.download = "download.json";
	a.href = window.URL.createObjectURL(bb);
	a.textContent = 'Download ready';
	a.dataset.downloadurl = ["text/plain", a.download, a.href].join(':');
	a.draggable = true;
	a.classList.add('dragout');

	a.click();
  
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////// 
