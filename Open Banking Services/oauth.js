var express = require('express', template = require('pug'));
var session = require('express-session')
var util = require('util');
var oauth = require('oauth');
var AM = require('./accountManager');
var nodemailer = require('nodemailer');
var cors = require('cors');
var Promise = require("bluebird");

var app = express();
var cookieParser = require('cookie-parser');
app.use(cors());

var pug = require('pug');

// This loads your consumer key and secret from a file you create.
var config = require('./config.json');

// Used to validate forms
var bodyParser = require('body-parser')

var getDetailsBank = function(email)
{
  return new Promise(function(resolve,reject){
    AM.getBankDetails(email,function(result){
      resolve(result);
    })
  })
}

// create application/x-www-form-urlencoded parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));/////////////////////////////////////////////////////////////////////////////////////////////////
var transporter = nodemailer.createTransport(config.Transporter);
var AdminEmailId = config.Credentials.AdminEmailId;
var AdminPass = config.Credentials.AdminPass;
/////////////////////////////////////////////////////////////////////////////////////////////////

var _openbankConsumerKey = config.consumerKey;
var _openbankConsumerSecret = config.consumerSecret;
var _openbankRedirectUrl = config.redirectUrl;


// The location, on the interweb, of the OBP API server we want to use.
var apiHost = config.apiHost;

console.log ("apiHost is: " + apiHost)


var consumer = new oauth.OAuth(
  apiHost + '/oauth/initiate',
  apiHost + '/oauth/token',
  _openbankConsumerKey,
  _openbankConsumerSecret,
  '1.0',                             //rfc oauth 1.0, includes 1.0a
  _openbankRedirectUrl,
  'HMAC-SHA1');

app.use(session({
  secret: "very secret",
  resave: false,
  saveUninitialized: true
}));

var makeid = function(lengthReqd) {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < lengthReqd; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

var requestToken;
var requestSecret;
var accessToken;
var accessSecret;
//req.session.oauthRequestToken
//req.session.oauthRequestTokenSecret
//req.session.oauthAccessToken
//req.session.oauthAccessTokenSecret

app.get('/connect', function(req, res){
  consumer.getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret, results){
    if (error) {
      res.status(500).send("Error getting OAuth request token : " + util.inspect(error));
    } else {
      requestToken = oauthToken;
      requestSecret = oauthTokenSecret;
      res.redirect(apiHost + "/oauth/authorize?oauth_token="+requestToken);
    }
  });
});

app.get('/callback', function(req, res){
  consumer.getOAuthAccessToken(
    requestToken,
    requestSecret,
    req.query.oauth_verifier,
    function(error, oauthAccessToken, oauthAccessTokenSecret, result) {
      if (error) {
        //oauthAccessToken, -Secret and result are now undefined
        res.status(500).send("Error getting OAuth access token : " + util.inspect(error));
      } else {
        //error is now undefined
        accessToken = oauthAccessToken;
        accessSecret = oauthAccessTokenSecret;
        res.redirect('/signed_in');
      }
    }
  );
});


app.get('/signed_in', function(req, res){

  var template = "./template/signedIn.pug"
  var options = {}
  var html = pug.renderFile(template, options)
  res.status(200).send(html)

   // 'Signing in by OAuth worked. Now you can do API calls on private data like this: <br><a href="/getMyAccounts">Get My Accounts</a> <br><a href="/getCurrentUser">Get Current User</a> <br><a href="/createTransactionRequest">Create Transaction Request (make payment)</a> <br> <a href="/loadCustomers">Load Customers (this is an admin utility function) </a> <br>  <br> Please see the <a href="https://apiexplorersandbox.openbankproject.com">API Explorer</a> for the full list of API calls available.')
});


app.get('/getCurrentUser', function(req, res){
  consumer.get(apiHost + "/obp/v2.1.0/users/current",
  accessToken,
  accessSecret,
  function (error, data, response) {
      var parsedData = JSON.parse(data);
      res.status(200).send(parsedData)
  });
});


app.get('/getMyAccounts', function(req, res){
  consumer.get(apiHost + "/obp/v2.1.0/my/accounts",
  accessToken,
  accessSecret,
  function (error, data, response) {
      var parsedData = JSON.parse(data);
      res.status(200).send(parsedData)
  });
});

app.get('/getAccountDetails',function(req,res){
  var email = "rohan183chougule@gmail.com"//req.body['email'];
  var details = {};

  AM.getBanksBy(email, function(result){
    //console.log(result)
    var getAllData = function(i, result, details)
    {
      console.log(result);
      consumer.get(apiHost + "/obp/v2.1.0/my/banks/"+result[i].bank+"/accounts/"+result[i].account+"/account",
      accessToken,
      accessSecret,
      function (error, data, response) {
          var parsedData = JSON.parse(data);
          //res.status(200).send(parsedData);
          details[result[i].account] = parsedData;
      });

      if(i != result.length){
        i = i + 1;
        getAllData(i, result, details);
      }
      else {
        res.status(200).send(details);
      }
    }
    getAllData(0,result,details);
  })

});

app.get('/getTransactionRequests',function(req,res){
  consumer.get(apiHost + "/obp/v2.1.0/banks/psd201-bank-x--uk/accounts/rohanBank3/owner/transaction-requests",
  accessToken,
  accessSecret,
  function (error, data, response) {
      var parsedData = JSON.parse(data);
      res.status(200).send(parsedData)
  });
})


app.get('/createTransactionRequest', function(req, res){


  var template = "./template/createTransactionRequest.pug";
  var options = { transactionRequestType :"SANDBOX_TAN"};
  var html = pug.renderFile(template, options);


  consumer.get(apiHost + "/obp/v2.1.0/my/accounts",
  accessToken,
  accessSecret,
  function (error, data, response) {
      var parsedData = JSON.parse(data);
      res.status(200).send(html)
  });
});



app.post('/createTransactionRequest', function(req, res){

  var fromBankId = req.body.from_bank_id;
  var fromAccountId = req.body.from_account_id;

  var toBankId = req.body.to_bank_id;
  var toAccountId = req.body.to_account_id;

  var currency = req.body.currency;
  var amount = req.body.amount;

  var description = req.body.description;
  var username = req.body.fromEmail;

  var transactionRequestType = req.body.transaction_request_type;

  console.log("transactionRequestType is: " + transactionRequestType);

  if (transactionRequestType.length == 0){
    transactionRequestType = "SANDBOX_TAN";
  }

  // Build the body that we will post
  var toObj = {"bank_id": toBankId, "account_id": toAccountId};
  var valueObj = {"currency":currency, "amount":amount};
  var detailsObj = {"to": toObj, "value": valueObj, "description": description}
  var details = JSON.stringify(detailsObj)

  console.log("details is: " + details);


  var viewId = "owner"
  var apiHost = config.apiHost
  var postUrl = apiHost + "/obp/v2.1.0/banks/" + fromBankId + "/accounts/" + fromAccountId + "/" + viewId + "/transaction-request-types/" + transactionRequestType + "/transaction-requests";

  console.log("postUrl is " + postUrl);

  consumer.post(postUrl,
  accessToken,
  accessSecret,
  details, // This is the body of the request
  "application/json", // Must specify this else will get 404
  function (error, data, response) {

      var error = JSON.stringify(error)

      console.log("error is: " + error)
      console.log("data is: " + data)
      console.log("response is: " + response)


        try {
          var parsedData = JSON.parse(data);
          console.log("parsedData is: " + parsedData)
          message = ""
        } catch (err) {
            // handle the error safely
            console.log(err)
            message = "Something went wrong creating a transaction request - did you supply the correct values?"
        }

      var options = {"error": error,
                     "postUrl" : postUrl,
                     "fromBankId": fromBankId,
                     "fromAccountId": fromAccountId,
                     "toBankId": toBankId,
                     "toAccountId" : toAccountId,
                     "currency" : currency,
                     "transactionRequestType" : transactionRequestType,
                     "details": details,
                     "data": data};


      AM.saveTransaction(parsedData, function(result){
        console.log(result);
        res.status(200).send(parsedData);
      })
  });
});

app.get('/answerTransactionRequest',function(req,res){
  var detailsObj = {"id":"9e391ab1-b9c0-4c37-bb0d-1c6ed7f44cda","answer":"1"}
  var body = JSON.stringify(detailsObj)
  //console.log("details is: " + details);
  var apiHost = config.apiHost;
  var postURL = apiHost + "/obp/v2.1.0/banks/psd201-bank-x--uk/accounts/rohanBank3/owner/transaction-request-types/SANDBOX_TAN/transaction-requests/f62c51af-d222-4326-93ea-aba1e669b862/challenge";

  consumer.post(postURL,
  accessToken,
  accessSecret,
  body, // This is the body of the request
  "application/json", // Must specify this else will get 404
  function(error, data, response){
    console.log("############## DATA");
    console.log(data);
    console.log("############## RESPONSE");
    console.log(response);
    res.send(data);
  });
})

app.post('/addBankAccount',function(req,res){
  var bankName = req.body['bank'];
  var account = req.body['account'];
  var permission = req.body['permission'];
  var email = req.body['email'];

  AM.addBankAccount(email, bankName, account, permission, function(result){
    console.log(result);
    res.status(200).send(result);
  })
})

app.post('/createGroup',function(req,res){
  var email = req.body['email'];
  var secret = req.body['secret'];
  var groupName = req.body['group'];
  var pass = req.body['password'];

  AM.createGroup(email, secret, groupName, pass, function(result){
    console.log(result);
    res.status(200).send(result);
  })
})

app.post('/joinGroup',function(req,res){
  var email = req.body['email'];
  var groupName = req.body['group'];
  var pass = req.body['pass'];
  var name = req.body['name'];

  AM.checkGroupPresent(email, function(result){
    if(result == false){
      AM.joinGroup(email, groupName, pass, name, function(result){
        console.log(result);
        res.status(200).send(result);
      })
    }
    else {
      res.status(200).send("NOT");
    }
  })
})

app.post('/placeTransaction',function(req,res){
  var email = req.body['email'];
  var amount = req.body['amount'];
  var group = req.body['group'];

  AM.placeTransaction(email, amount, group, function(result){
    console.log(result);
    res.status(200).send("OKAY");
  })
})

app.post('/showTransactions',function(req,res){
  var email = req.body['email'];
  var group = req.body['group'];

  AM.getTransactionsGroup(group, function(result){
    res.status(200).send(result);
  })
})

app.post('/completeTransaction',function(req,res){
  var TID = req.body['TID'];
  var group = req.body['group'];
  var amount = req.body['amount'];
  var email = req.body['email']
  var selfBank = req.body['selfBank'];
  var selfAccount = req.body['selfAccount'];
  var toBank //= 'psd201-bank-x--uk'//req.body['toBank'];
  var toAccount //= 'rohanBank'//req.body['toAccount'];

  console.log(TID);
  console.log(group);
  console.log(amount);
  console.log(email,selfBank,selfAccount);

  AM.getBankDetails(email, function(resu){
    toBank = resu.bank;
    toAccount = resu.account;
    AM.performTransactionGroup(TID, group, amount, function(result){
      console.log(result);
    })

    var fromBankId = selfBank;
    var fromAccountId = selfAccount;
    var toBankId = toBank;
    var toAccountId = toAccount;
    var currency = "EUR";
    //var amount = amount;
    var description = "groupTransfer";
    var emailTo = email;
    var transactionRequestType = "SANDBOX_TAN";

    console.log("transactionRequestType is: " + transactionRequestType);

    if (transactionRequestType.length == 0){
      transactionRequestType = "SANDBOX_TAN";
    }

    // Build the body that we will post
    var toObj = {"bank_id": toBankId, "account_id": toAccountId};
    console.log(toObj);
    var valueObj = {"currency":currency, "amount":amount};
    var detailsObj = {"to": toObj, "value": valueObj, "description": description}
    var details = JSON.stringify(detailsObj)

    console.log("details is: " + details);

    var viewId = "owner"
    var apiHost = config.apiHost
    var postUrl = apiHost + "/obp/v2.1.0/banks/" + fromBankId + "/accounts/" + fromAccountId + "/" + viewId + "/transaction-request-types/" + transactionRequestType + "/transaction-requests";

    console.log("postUrl is " + postUrl);

    consumer.post(postUrl,
      accessToken,
      accessSecret,
      details, // This is the body of the request
      "application/json", // Must specify this else will get 404
      function (error, data, response) {

        var error = JSON.stringify(error)

        console.log("error is: " + error)
        console.log("data is: " + data)
        console.log("response is: " + response)


        try {
          var parsedData = JSON.parse(data);
          console.log("parsedData is: " + parsedData)
          message = ""
        } catch (err) {
          // handle the error safely
          console.log(err)
          message = "Something went wrong creating a transaction request - did you supply the correct values?"
        }

        res.status(200).send("OKAY");
      });
  })

})

app.post('/getTransactionReceipts',function(req,res){
  var bankName = req.body['bank'];
  var accountName = req.body['account'];

  var email = req.body['email']//"garun7623@gmail.com";
  var secret = req.body['secret']//"OHw3gtkYZxuxh49aAmD0";

  var transactions = {};

  AM.getBanksBySecret(email, secret, function(result){
    if(result){
      console.log("## result");
      console.log(result);
      var getDetails = function(i, result, transactions)
      {
        var bank = result[i].bank;
        var account = result[i].account;
        console.log("## Bank Account Details Fetching For : " + account);

        consumer.get(apiHost + "/obp/v2.1.0/banks/"+bank+"/accounts/"+account+"/owner/transaction-requests",
        accessToken,
        accessSecret,
        function (error, data, response) {
            var parsedData = JSON.parse(data);
            transactions[account] = parsedData.transaction_requests_with_charges;
            i = i + 1;
            if(i != result.length){
              getDetails(i, result, transactions);
            }
            else {
              console.log("## FETCHING DONE")
              console.log(transactions);
              res.status(200).send(transactions);
            }
        });
      }
      getDetails(0,result,transactions);
    }
    else {
      res.status(200).send("ERROR");
    }
  })
})

var getEmails = function(group)
{
  return new Promise(function(resolve,reject){
    AM.getMembers(group, function(result){
      resolve(result);
    })
  })
}

var getBanks = function(email)
{
  //console.log(email);
  return new Promise(function(resolve, reject){
    AM.getBanksByEmail(email, function(result,email){
      resolve(result, email);
    })
  })
}

app.get('/getAllTransactions',function(req,res){
  var groupName = "barclays";
  var transactions = {};

  AM.getBanks(groupName, function(result){
    if(result.length != 0){
      console.log("## result");
      console.log(result);
      var getDetails = function(i, result, transactions)
      {
        var bank = result[i].bank;
        var account = result[i].account;
        console.log("## Bank Account Details Fetching For : " + account);

        consumer.get(apiHost + "/obp/v2.1.0/banks/"+bank+"/accounts/"+account+"/owner/transaction-requests",
        accessToken,
        accessSecret,
        function (error, data, response) {
            var parsedData = JSON.parse(data);
            transactions[account] = {
              email : result[i].email,
              transactions : parsedData.transaction_requests_with_charges
            }
            i = i + 1;
            if(i != result.length){
              getDetails(i, result, transactions);
            }
            else {
              console.log("## FETCHING DONE")
              console.log(transactions);
              res.status(200).send(transactions);
            }
        });
      }
      getDetails(0,result,transactions);
    }
    else {
      res.status(200).send("ERROR");
    }
  })

})



// app.get('/getAllTransactions',function(req,res){
//   var groupName = "barclays";
//
//   getEmails(groupName).then((memb)=>{
//     global.members = memb;
//   })
//   .then(()=>{
//     console.log(global.members);
//     // for(var i = 0;i<members.length;i++)
//     // {
//     //   getBanks((members[i].email)).then((banks,email)=>{
//     //     details.push({bankDetails:banks})
//     //   })
//     // }
//
//     var memLen = function(i, members, details)
//     {
//       console.log(global.details);
//       getBanks((global.members[i].email)).then((banks,email)=>{
//         global.details.push({bankDetails:banks})
//       })
//       .then(()=>{
//         i = i +1;
//         if(i != global.members.length){
//           memLen(i, global.members, global.details);
//         }
//         else {
//           var getDetails = function(i,details, transactions)
//           {
//             //console.log(result);
//             var bank = global.details[i].bankDetails.bank;
//             var account = global.details[i].bankDetails.account;
//             console.log(bank,account)
//             //console.log("## Bank Account Details Fetching For : " + account);
//
//             consumer.get(apiHost + "/obp/v2.1.0/banks/"+bank+"/accounts/"+account+"/owner/transaction-requests",
//             accessToken,
//             accessSecret,
//             function (error, data, response) {
//               var parsedData = JSON.parse(data);
//               global.transactio[account] = {
//                 email : global.details[i].bankDetails.email,
//                 transactions : parsedData.transaction_requests_with_charges
//               }
//               i = i + 1;
//               if(i != global.details.length){
//                 getDetails(i, global.details,global.transactio);
//               }
//               else {
//                 console.log("## FETCHING DONE")
//                 //console.log(transactions);
//                 res.status(200).send(global.transactio);
//               }
//             });
//           }
//           getDetails(0,global.details,global.transactio);
//
//         }
//       })
//     }
//     memLen(0, global, global.details)
//
//   })
//
// })

// app.get('/getAllTransactions',function(req,res){
//   var groupName = "barclays"//req.body['group'];
//
//   var transactions = {};
//
//   AM.getMembers(groupName, function(members){
//     //console.log(result);
//       var allMem = function(i, result, transactions, members)
//       {
//         //console.log(result);
//         AM.getBanksByEmail(result[i].email,  function(result3){
//           if(result3){
//             //console.log("## result");
//             //console.log(result3);
//             var getDetails = function(j, result2, transactions, email)
//             {
//               console.log(result2);
//               var bank = result2.bank;
//               var account = result2.account;
//               console.log("## Bank Account Details Fetching For : " + account);
//
//               consumer.get(apiHost + "/obp/v2.1.0/banks/"+bank+"/accounts/"+account+"/owner/transaction-requests",
//               accessToken,
//               accessSecret,
//               function (error, data, response) {
//                   var parsedData = JSON.parse(data);
//                   transactions[account] = {
//                     email : email,
//                     transactions : parsedData.transaction_requests_with_charges,
//                   }
//                   j = j + 1;
//                   if(i != result2.length){
//                     getDetails(j, result2, transactions);
//                   }
//                   else {
//                     //console.log("## FETCHING DONE")
//                     //console.log(transactions);
//                   }
//               });
//             }
//             getDetails(0,result3,transactions,result3.email);
//           }
//           else {
//             res.status(200).send("ERROR");
//           }
//         })
//
//         i = i + 1;
//         if(i != result.length){
//           allMem(i, result, transactions, members);
//         }
//         else {
//           //console.log(transactions);
//           res.status(200).send(transactions);
//         }
//       }
//       allMem(0, result, transactions, members);
//   })
//
// })


// Loop through a Customers file, find the User matching email, Post the customer (which links to the User)
app.get('/loadCustomers', function(req, res) {

    var template = "./template/loadCustomers.pug";

    // Location of customer file is stored in filesConfig.json like this:
    //
    // {
    // "customerFile": "/path-to/OBP_sandbox_customers_pretty.json",
    // "sandboxFile": "/path-to/OBP_sandbox_pretty.json"
    // }

    var filesConfig = require('./filesConfig.json');

    var customers = require(filesConfig.customerFile);


    console.log('before customer loop. There are ' + customers.length + ' customers.')


    customers.forEach(function processCustomer(customer) {

            var usersByEmailUrl = apiHost + '/obp/v2.1.0/users/' + customer.email;
            console.log('url to call: ' + usersByEmailUrl)

            // get user by email
            consumer.get(usersByEmailUrl,
                accessToken,
                accessSecret,
                function getUserForCustomer(error, data) {
                    if (error) return console.log(error);
                    var usersData = JSON.parse(data);
                    console.log('usersData is: ' + JSON.stringify(usersData))
                    var userId = usersData.users[0].user_id
                    console.log('I got userId: ' + userId)
                    console.log('I got customer with email , number : ' + customer.email + ' , ' + customer.customer_number)
                    customerToPost = {
                        "user_id": userId,
                        "customer_number": customer.customer_number,
                        "legal_name": customer.legal_name,
                        "mobile_phone_number": customer.mobile_phone_number,
                        "email": customer.email,
                        "face_image": customer.face_image,
                        "date_of_birth": customer.date_of_birth,
                        "relationship_status": customer.relationship_status,
                        "dependants": customer.dependants,
                        "dob_of_dependants": customer.dob_of_dependants,
                        "highest_education_attained": customer.highest_education_attained,
                        "employment_status": customer.employment_status,
                        "kyc_status": customer.kyc_status,
                        "last_ok_date": customer.last_ok_date
                    }

                    console.log('customerToPost: ' + JSON.stringify(customerToPost))

                    var postCustomerUrl = apiHost + '/obp/v2.1.0/banks/' + customer.bank_id + '/customers';

                    console.log('postCustomerUrl: ' + postCustomerUrl)


                    consumer.post(postCustomerUrl,
                        accessToken,
                        accessSecret,
                        JSON.stringify(customerToPost), // This is the body of the request
                        "application/json", // Must specify this else will get 404
                        function (error, data) {
                            if (error) return console.log(error);
                            var parsedData = JSON.parse(data);
                            console.log('response from postCustomerUrl: ' + JSON.stringify(parsedData))

                        }); // End post customer

                }); // End get user by email

    }); // End Customer loop


    var options = {
        "countCustomers": customers.length
    };
    var html = pug.renderFile(template, options);

    res.status(200).send(html)

});



// Create Entitlements for user (e.g. loop through banks)
app.get('/createEntitlements', function(req, res) {

    var template = "./template/simple.pug"

    // Location of sandbox file is stored in filesConfig.json like this:
    //
    // {
    // "customerFile": "/path-to/OBP_sandbox_customers_pretty.json",
    // "sandboxFile": "/path-to/OBP_sandbox_pretty.json"
    // }

    var dataConfig = require('./filesConfig.json')

    var sandbox = require(dataConfig.sandboxFile)

    var banks = sandbox.banks


    console.log('before loop. There are ' + banks.length + ' banks.')


    // {
    // "userId": "asiodiuiof35234"
    // }

    var miscConfig = require('./miscConfig.json')

    var userId = miscConfig.userId

    banks.forEach(function processCustomer(bank) {

            var postUrl = apiHost + '/obp/v2.1.0/users/' + userId + '/entitlements';
            console.log('url to call: ' + postUrl)

            //var postBody = {"bank_id":bank.id, "role_name":"CanCreateCustomer"}
            var postBody = {"bank_id":bank.id, "role_name":"CanCreateUserCustomerLink"}

            consumer.post(postUrl,
                accessToken,
                accessSecret,
                JSON.stringify(postBody), // This is the body of the request
                "application/json", // Must specify this else will get 404
                function getUserForCustomer(error, data) {
                    if (error) return console.log(error);
                    var data = JSON.parse(data);
                    console.log('data is: ' + JSON.stringify(data))
                }); // End POST
    }); // End Loop


    var options = {
        "count": banks.length
    };
    var html = pug.renderFile(template, options);

    res.status(200).send(html)

});


///////////////////////////////////////// DASHBOARD SETTINGS //////////////////////////////////////////////////
app.post('/login', function(req, res){
  console.log("###  login post");
  AM.manualLogin(req.body['email'], req.body['password'], function(e, o){
    if (!o){
      console.log(e)
      res.status(200).send("ERROR");
    }	else{
      var id = makeid(6);
      AM.setCode(req.body['email'], id, function(result){

        console.log("Code Set for User : "+req.body['email'] + " :: " + result);

        var part1='<head> <title> </title> <style> #one{ position: absolute; top:0%; left:0%; height: 60%; width: 40%; } #gatii{ position: absolute; top:26%; left:5%; height: 20%; width: 20%; } #text_div { position: absolute; top: 10%; left: 5%; } #final_regards { position: absolute; top: 50%; left: 5%; } </style> </head> <body> <div id="text_div"> <b>Welcome, to SIPcoin. You have been successfully registered on SIPcoin.io </b> <br> <br> Please click on the link below to verify your account <br><br>';
        var part2=' <br><br> <br> P.S.- You are requested to preserve this mail for future references. <br> <br> </div> <iframe id="gatii" src="https://drive.google.com/file/d/1k99fX9I4HOdhKZA1KwrDflM1W-orCSh0/preview" width="40" height="40"></iframe> <br> <br> <div id="final_regards"> Thank You, <br> <br> Team SIPcoin.io <br> <br> <a href="http://support.sipcoin.io">Support Team</a> <br> <br> </div> </body>'

        var URLforVerification = "## Login Token : " + result;

        var mailOptions = {
          from: AdminEmailId,
          to: req.body['email'],
          subject: 'BARCLAYS || Login Token',
          html: part1 +URLforVerification+part2,
        };

        transporter.sendMail(mailOptions,function(error, info){

          if (error) {
            console.log("Email Not Sent, Error : " + error);
          } else {
            console.log('Email Sent: ' + info.response);
          }
          res.status(200).send("OKAY");
        });
      })
    }
  });
});

app.post('/verifyTwo',function(req,res){
  console.log("verify two")
  var id = req.body['token'];
  var email = req.body['email'];
  console.log(id);
  console.log(email);
  AM.getAccountViaToken(email, id, function(account){
    if(account){
      console.log(account);
      res.status(200).send(account);
    }
    else {
      res.status(200).send(null);
    }
  })
})

app.post('/signup',function(req,res){

  var newAccount = {
  name 	: req.body.name,
  email 	: req.body.email,
  //user 	: req.body['username'],
  //mobile : req.body['mobileUser'],
  pass	: req.body.password,
  twoFA : false,
  secret : makeid(20),
  accountVerified : true,
}

AM.addNewAccount(newAccount, function(e){
  if (e){
    console.log('error in account creation');
    res.status(400).send(e);
  }	else{

    var part1='<head> <title> </title> <style> #one{ position: absolute; top:0%; left:0%; height: 60%; width: 40%; } #gatii{ position: absolute; top:26%; left:5%; height: 20%; width: 20%; } #text_div { position: absolute; top: 10%; left: 5%; } #final_regards { position: absolute; top: 50%; left: 5%; } </style> </head> <body> <div id="text_div"> <b>Welcome, to SIPcoin. You have been successfully registered on SIPcoin.io </b> <br> <br> Please click on the link below to verify your account <br><br>';
    var part2=' <br><br> <br> P.S.- You are requested to preserve this mail for future references. <br> <br> </div> <iframe id="gatii" src="https://drive.google.com/file/d/1k99fX9I4HOdhKZA1KwrDflM1W-orCSh0/preview" width="40" height="40"></iframe> <br> <br> <div id="final_regards"> Thank You, <br> <br> Team SIPcoin.io <br> <br> <a href="http://support.sipcoin.io">Support Team</a> <br> <br> </div> </body>'

    console.log('account created successfully');

    var URLforVerification = "/verify?secretKey=" + newAccount.secret + "&veri=" + makeid(5);

    var mailOptions = {
      from: AdminEmailId,
      to: newAccount.email,
      subject: 'BARCLAYS || Successful Registration',
      html: part1 +URLforVerification+part2,
    };

    transporter.sendMail(mailOptions,function(error, info){

      if (error) {
        console.log("Email Not Sent, Error : " + error);
      } else {
        console.log('Email Sent: ' + info.response);
      }
      res.status(200).send('OKAY');
    });
  }
});

})

app.get('/check',function(req,res){
  res.status(200).send("check done");
})


app.get('*', function(req, res){
  res.redirect('/connect');
});

app.listen(8085);
