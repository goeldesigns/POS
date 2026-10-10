/** Demo people. All names, phones and emails are fictional seed data. */

export const CUSTOMER_NAMES = [
  "Rahul Sharma", "Priya Mehta", "Arjun Kapoor", "Neha Verma", "Ananya Iyer", "Rohit Bansal", "Sneha Reddy",
  "Vikram Joshi", "Kavya Nair", "Aditya Rao", "Pooja Agarwal", "Siddharth Menon", "Ishita Ghosh", "Karthik Subramanian",
  "Meera Pillai", "Aman Gupta", "Divya Krishnan", "Nikhil Desai", "Riya Chatterjee", "Harsh Vardhan", "Tanvi Kulkarni",
  "Varun Malhotra", "Shreya Bhat", "Manish Tiwari", "Aishwarya Hegde", "Abhishek Mishra", "Nandini Shetty", "Saurabh Jain",
  "Lakshmi Narayan", "Gaurav Saxena", "Pallavi Deshpande", "Kunal Khanna", "Deepika Rangan", "Ravi Shankar", "Simran Kaur",
  "Arvind Swamy", "Trisha Fernandes", "Mohit Chawla", "Bhavana Murthy", "Yash Thakkar", "Anjali Pandey", "Suresh Babu",
  "Farah Khan", "Naveen Kumar", "Madhuri Patil", "Imran Sheikh", "Ritu Arora", "Pranav Goyal", "Swati Mukherjee",
  "Akash Venkatesh", "Zoya Mirza", "Rajesh Pillai", "Komal Sethi", "Tarun Bhatia", "Uma Maheshwari", "Dev Anand Rao",
  "Hema Sundar", "Sameer Kulkarni", "Aditi Banerjee", "Prakash Gowda",
];

export function phoneFor(index: number, prefix = "98") {
  const n = (73_421_117 + index * 1_234_567) % 100_000_000;
  return `${prefix}${String(n).padStart(8, "0")}`;
}

export function emailFor(name: string) {
  const [first, last] = name.toLowerCase().split(" ");
  return `${first}.${last ?? "guest"}@example.com`;
}

export const STAFF_ONLY = [
  { name: "Mohammed Rafiq", roleTitle: "Head Chef", salary: 65000, phone: "9845100201" },
  { name: "Gopal Krishna", roleTitle: "Chef", salary: 38000, phone: "9845100202" },
  { name: "Santosh Kumar", roleTitle: "Chef", salary: 34000, phone: "9845100203" },
  { name: "Bikash Thapa", roleTitle: "Kitchen Helper", salary: 18000, phone: "9845100204" },
  { name: "Ravi Teja", roleTitle: "Bartender", salary: 26000, phone: "9845100205" },
  { name: "Joseph D'Souza", roleTitle: "Waiter", salary: 19000, phone: "9845100206" },
  { name: "Asha Kumari", roleTitle: "Housekeeping", salary: 15000, phone: "9845100207" },
  { name: "Manoj Yadav", roleTitle: "Delivery Executive", salary: 17000, phone: "9845100208" },
];

export const RESERVATION_NOTES = [
  "Birthday celebration — please arrange a small cake",
  "Window seating preferred",
  "Anniversary dinner",
  "Corporate lunch, need GST invoice",
  "One guest is vegan",
  "Bringing a toddler — high chair needed",
  "Quiet corner please",
  null,
  null,
  null,
];
