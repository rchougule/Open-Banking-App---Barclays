$(document).ready(function(){

  	  		var ip = "198.162.42.123/";

  	  		function doAjax(route,data){
				return new Promise(function(resolve,reject){
					var settings = {
					  "async": true,
					  "crossDomain": true,
					  "url": ip+route,
					  "method": "POST",
					  "headers": {
					    "content-type": "application/x-www-form-urlencoded",
					    "cache-control": "no-cache"
					  },
					  "data": data
					  }

					$.ajax(settings).done(function (response) {
					  resolve(response);
					}).fail(function(jqXHR, textStatus, errorThrown){
					  Materialize.toast('Error!', 4000)
					});
				})
			}

			function oAuth(){
				doAjax("connect",{}).then(function(result){
					if(result=="OKAY")
					{
						
					}
				});
			}
			
  	  	});