$(document).ready(function(){

	var memory_app = new MemoryApp();

	memory_app.init();
	
	$("#btn_make_indices").on("click", function() {
		memory_app.memory_db.make_all_indices();
	});
	
});

