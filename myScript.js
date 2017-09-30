$(document).ready(function() {
  let revenueAndCapacityDBs = {};
  $.ajax({
    type: "GET",
    url: "https://gist.githubusercontent.com/yonbergman/7a0b05d6420dada16b92885780567e60/raw/114aa2ffb1c680174f9757431e672b5df53237eb/data.csv",
    dataType: "text",
    success: function(data) {
      let json = CSV2JSON(data);
      revenueAndCapacityDBs = generateRevenueAndCapacityDBs(json);
    }
  });

  $("#convert").click(function() {
    let date = $("#date").val();
    const totalSum = getRevenueByDate(revenueAndCapacityDBs, date)
    $("#revenueSum").text(totalSum.revenueSum);
    $("#unreservedCapacitySum").text(totalSum.unreservedCapacitySum);
  });
});

function generateRevenueAndCapacityDBs(sortedArrayByDate){
  const reservations = _.map(sortedArrayByDate, (reservation) => {
    let startDate = moment(reservation["StartDay"])
    let endDate = reservation["EndDay"].length > 0 ? moment(reservation["EndDay"]) : null
    return serializeReservation(reservation.id, reservation["Capacity"], reservation["MonthlyPrice"], startDate, endDate)
  })
  let olderReservationsRevenueSum = 0;
  let olderReservationsCapacitySum = 0;
  let shortTermResDB = {};
  let longTermResDB = {};
  _.times(reservations.length, (i)=>{
    let currResObj = reservations[i];
    if(currResObj && currResObj.type === "shortTerm"){
      for (let year in currResObj) {
        if(_.has(shortTermResDB, year)) { // Check if DB already have this year key
          for (let month in currResObj[year]) {
            if(_.has(shortTermResDB[year], month)) { // Check if DB already have this month key
              shortTermResDB[year][month] = {
                revenue: shortTermResDB[year][month].revenue + currResObj[year][month], // Sums this month reservations revenue
                capacity: shortTermResDB[year][month].capacity + currResObj.capacity // Sums this month reservations Capacity
              };
            } else { // Initialize month
              shortTermResDB[year][month] = {
                revenue: 0,
                capacity: 0
              };
              shortTermResDB[year][month] = {
                revenue: shortTermResDB[year][month].revenue + currResObj[year][month],
                capacity: shortTermResDB[year][month].capacity + currResObj.capacity
              };
            }
          }
        } else { // Initialize year
          if(year === "id" || year === "capacity" || year === "type"){
            continue;
          }
          shortTermResDB[year] = {}
          for (let month in currResObj[year]) {
            shortTermResDB[year][month] = {
              revenue: 0,
              capacity: 0
            };
            shortTermResDB[year][month] = {
              revenue: shortTermResDB[year][month].revenue + currResObj[year][month],
              capacity: shortTermResDB[year][month].capacity + currResObj.capacity
            };
          }
        }
      }
    } else {
      let year = currResObj.startDate.format("YYYY");
      let month = currResObj.startDate.format("MM");
      if(_.has(longTermResDB, year)) { // Check if DB already have this year key
          if(_.has(longTermResDB[year], month)) { // Check if DB already have this month key
            longTermResDB[year][month] = {
              currentMonthRevenue: longTermResDB[year][month].currentMonthRevenue + currResObj.firstMonthRev, // Sums this month reservations revenue
              capacity: olderReservationsCapacitySum + currResObj.capacity // Sums this month reservations capacity, with older reservations
            };
            if(month === 12){
              year = year+1;
              month = 1
            }
            longTermResDB[year][month].olderReservationsRevenue = olderReservationsRevenueSum + currResObj.monthlyPrice; // Add monthlyPrice to older reservations, for total summarize
          } else {
            longTermResDB[year][month] = {
              currentMonthRevenue: currResObj.firstMonthRev + olderReservationsRevenueSum,
              capacity: olderReservationsCapacitySum + currResObj.capacity,
              olderReservationsRevenue: 0
            };
            if(month === 12){
              year = year+1;
              month = 1
            }
            longTermResDB[year][month].olderReservationsRevenue = olderReservationsRevenueSum + currResObj.monthlyPrice;
        }
      } else {
          longTermResDB[year] = {};
          longTermResDB[year][month] = {
            currentMonthRevenue: currResObj.firstMonthRev + olderReservationsRevenueSum,
            capacity: olderReservationsCapacitySum + currResObj.capacity,
            olderReservationsRevenue: 0,
          };
          if(month === 12){
            year = year+1;
            month = 1
          }
          longTermResDB[year][month].olderReservationsRevenue = olderReservationsRevenueSum + currResObj.monthlyPrice
        }
        olderReservationsCapacitySum = olderReservationsCapacitySum + currResObj.capacity; // Add this month capacity to older reservations, for total summarize
        olderReservationsRevenueSum = olderReservationsRevenueSum + currResObj.monthlyPrice; // Add monthlyPrice to older reservations, for total summarize
    }
})

return {shortTermResDB, longTermResDB};
}

function getRevenueByDate(revenueAndCapacityDBs, date) {

  let dateToMoment = moment(date)
  const month = dateToMoment.format("MM");
  const year = Number(dateToMoment.format("YYYY"));
  const shortTermReservationsDB = revenueAndCapacityDBs.shortTermResDB;
  const longTermReservationsDB = revenueAndCapacityDBs.longTermResDB;
  const longTemoReservationsDataByDate = getLongTermRevenueByDate(longTermReservationsDB, month, year);
  const shortTemoReservationsDataByDate = getShortTermRevenueByDate(shortTermReservationsDB, month, year);
  // CHECK FOR SHORT TERM RESERVATIONS REVENUE BY MONTH
  const revenueSum = longTemoReservationsDataByDate.revenue + shortTemoReservationsDataByDate.revenue;
  const unreservedCapacitySum = 266 - (longTemoReservationsDataByDate.capacity + shortTemoReservationsDataByDate.capacity); // 266 I took it as max capacity from the first example.
  return {revenueSum, unreservedCapacitySum}
}

function serializeReservation(reservationId, capacity = 0, monthlyPrice, dateStart = moment("1970-1-1"), dateEnd) {
  monthlyPrice = Number(monthlyPrice);
  let currDate = _.cloneDeep(dateStart);
  let monthsRev = {};
  if(dateEnd){
    while (currDate.isSameOrBefore(dateEnd)) {
      // First, calculate month revenue
      let monthRevenue;
      if(currDate.diff(dateStart, "months") === 0 ){ // Check if current month isEqual to firstMonth
        monthRevenue = getMonthRevenue(monthlyPrice, currDate.daysInMonth(),currDate.daysInMonth()-dateStart.format("DD")+1);
      } else if (currDate.diff(dateEnd, "months") === 0) { // Check if current month isEqual to lastMonth
        monthRevenue = getMonthRevenue(monthlyPrice, currDate.daysInMonth(),dateEnd.format("DD"));
      } else {
        monthRevenue = monthlyPrice; // Full price
      }
      // Then, Initialize record on the reservation.
      if(_.has(monthsRev, currDate.format("YYYY"))) {
        monthsRev[currDate.format("YYYY")][currDate.format("MM")] = monthRevenue;
      } else {
        monthsRev[currDate.format("YYYY")] = {};
        monthsRev[currDate.format("YYYY")][currDate.format("MM")] = monthRevenue;
      }
      currDate.add(1,"month");
    }
    monthsRev.type = "shortTerm"; // Represent a reservation with an "End Date".
  } else {
    let monthRevenue;
    if(currDate.diff(dateStart, "months") === 0 ){ // Check if current month isEqual to firstMonth *there is no End Date
      monthRevenue = getMonthRevenue(monthlyPrice, currDate.daysInMonth(),currDate.daysInMonth()-dateStart.format('DD')+1);
    } else {
      monthRevenue = monthlyPrice; // Full price
    }
    monthsRev = {
      startDate: dateStart,
      firstMonthRev: monthRevenue,
      monthlyPrice: monthlyPrice,
      capacity: capacity
    };
    monthsRev.type = "longTerm"; // Represent a reservation without "End Date".
  }
  monthsRev.capacity = Number(capacity);
  return monthsRev;
}

function getMonthRevenue(monthlyPrice, daysInMonth, reservedDays) { // Calculate day * reserved days
  return monthlyPrice/daysInMonth*reservedDays;
}

function getLongTermRevenueByDate(longTermReservationsDB, month, year) {
  // Check for long term revenie by month
  let clonedYear = _.cloneDeep(year);
  if(_.has(longTermReservationsDB, year)){ // Check if DB has this year key record
    if(_.has(longTermReservationsDB[year], month)){ // Check if DB has this month key record
      return {
        revenue: longTermReservationsDB[year][month].currentMonthRevenue,
        capacity: longTermReservationsDB[year][month].capacity
      };
    } else {
      let clonedMonth = month;
        while (clonedMonth > 0) { // Search for the closest month <
          clonedMonth = clonedMonth < 10 ? "0"+clonedMonth : clonedMonth;
          if(_.has(longTermReservationsDB[clonedYear],[clonedMonth])){
            return {
              revenue: longTermReservationsDB[clonedYear][clonedMonth].olderReservationsRevenue,
              capacity: longTermReservationsDB[clonedYear][clonedMonth].capacity
            };
          }
          clonedMonth--
        }
        if(clonedMonth === 0) { // Search for the closest month in previouse years
          while(clonedYear > 2009){ // 2010 WeWork was founded.
              if(_.has(longTermReservationsDB, clonedYear)){
                clonedMonth = _.findLastKey(longTermReservationsDB[clonedYear])
                return {
                  revenue: longTermReservationsDB[clonedYear][clonedMonth].olderReservationsRevenue,
                  capacity: longTermReservationsDB[clonedYear][clonedMonth].capacity
                };
              }
              clonedYear--;
          }
        }
    }
  } else {
      while(clonedYear > 2009){ // Search for the closest month in previouse years
          if(_.has(longTermReservationsDB, clonedYear)){
            let months = 12;
            while (months > 0) { // Search for the closest month <
              let currMonth = months < 10 ? "0"+months : months;
              if(_.has(longTermReservationsDB[clonedYear],[currMonth])){
                return {
                  revenue: longTermReservationsDB[clonedYear][currMonth].olderReservationsRevenue,
                  capacity: longTermReservationsDB[clonedYear][currMonth].capacity
                };
              }
              months--
            }

          }
          clonedYear--;
      }
      return {
        revenue: 0,
        capacity: 0
      };
  }
}

function getShortTermRevenueByDate(shortTermReservationsDB, month, year) {
  if(_.has(shortTermReservationsDB, year) && _.has(shortTermReservationsDB[year], month)){
    return {
      revenue: shortTermReservationsDB[year][month].revenue,
      capacity: shortTermReservationsDB[year][month].capacity
   }
  } else {
     return {
       revenue: 0,
       capacity: 0
    }
  }
}

function CSVToArray(strData, strDelimiter) {
  strDelimiter = (strDelimiter || ",");
  let objPattern = new RegExp((
  "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +
  "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
  "([^\"\\" + strDelimiter + "\\r\\n]*))"), "gi");
  let arrData = [[]];

  let arrMatches = null;
  let strMatchedValue;
  while (arrMatches = objPattern.exec(strData)) {
    let strMatchedDelimiter = arrMatches[1];

    if (strMatchedDelimiter.length && (strMatchedDelimiter != strDelimiter)) {

      arrData.push([]);
    }

    if (arrMatches[2]) {

      strMatchedValue = arrMatches[2].replace(
        new RegExp("\"\"", "g"), "\"");
    } else {
      strMatchedValue = arrMatches[3];
    }

    arrData[arrData.length - 1].push(strMatchedValue);
  }
  return (arrData);
}

function CSV2JSON(csv) {
  const array = CSVToArray(csv);
  let objArray = [];
  for (let i = 1; i < array.length; i++) {
    objArray[i - 1] = {};
    for (let k = 0; k < array[0].length && k < array[i].length; k++) {
      let key = array[0][k];
      let keyWithoutSpaces = key.replace(/\s/g, '');
      objArray[i - 1][keyWithoutSpaces] = array[i][k]
    }
    objArray[i - 1].id = i-1;
  }
  const sortedArrayByDate = _.sortBy(objArray, reservation=>reservation["StartDay"]);
  return sortedArrayByDate;
}
