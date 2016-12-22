var dates = document.getElementsByClassName("date");
var offset = new Date().getTimezoneOffset();

for (var i = 0; i < dates.length; i++) {
  var dateElement = dates[i]
  var time = new Date(parseInt(dateElement.innerHTML, 10) * 1000);
  var hours = time.getHours()
  var minutes = time.getMinutes()
  dateElement.innerHTML
    = time.getFullYear().toString() + "-" +
      (time.getMonth() + 1).toString() + "-" +
      time.getDate().toString() +
      " " +
      (hours < 10 ? "0" + hours.toString() : hours.toString()) +
      (minutes < 10 ? "0" + minutes.toString() : minutes.toString());
}
