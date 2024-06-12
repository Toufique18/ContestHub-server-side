const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();

const port = process.env.PORT || 5000;



//middleware
app.use(cors());
app.use(express.json());

//mongodb connection

//console.log(process.env.DB_USER)

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mhvsuxa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const contestCollection = client.db('contesthub').collection('contest_info');
    const usersCollection = client.db('contesthub').collection('user');


    //user store
    app.post("/users", async (req, res) => {
      const { email } = req.body;
      const existingUser = await usersCollection.findOne({ email });

      if (existingUser) {
        res.status(200).send({ message: 'User already exists' });
      } else {
        const result = await usersCollection.insertOne(req.body);
        res.status(201).send(result);
      }
    });
    //user role
    app.patch("/users/:id/role", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });
    //user delete
    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Add route to fetch users
app.get("/users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Error fetching users" });
  }
});


    app.get("/contest_info", async (req, res) => {
      const coursor = contestCollection.find();
      const result = await coursor.toArray()
      res.send(result)
    })
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Contesthub server is running')
})

app.listen(port, () => {
  console.log(`Contesthub server is running on port: ${port}`)
})
